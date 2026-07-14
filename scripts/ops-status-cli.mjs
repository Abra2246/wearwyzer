#!/usr/bin/env node
// Thin fs/network-writing CLI around scripts/ops-status-builder.mjs. Reads
// every local automation artifact plus (when available) live GitHub queue/CI
// state, builds the sanitized `ops/status.json` document, and refuses to
// write it unless it passes both the closed-schema check and the
// secret-like-value scan (scripts/ops-status-schema.mjs) — a build-time
// gate, not just a test-time one.
//
// Usage:
//   node scripts/ops-status-cli.mjs [--dry-run] [--now <iso>]
//
// GITHUB_TOKEN + GITHUB_REPOSITORY are optional: without them, queue/CI
// fields degrade to their "unavailable" defaults (automationState "idle",
// ci.status "unknown") rather than failing — see docs/OPS_DASHBOARD_V1.md
// "Local / unauthenticated runs" for what that means for dashboard
// accuracy. No new secret is introduced; this reuses the same
// `GITHUB_TOKEN` every other queue script already uses.
//
// Canonical spec: docs/OPS_DASHBOARD_V1.md

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readEvents } from './record-status-event.mjs';
import { readLedger } from './openai-spend-ledger.mjs';
import { buildOpsStatus } from './ops-status-builder.mjs';
import { validateStatusShape, findSecretLikeValues } from './ops-status-schema.mjs';
import { clientFromEnv } from './queue-github-client.mjs';
import { INCIDENT_LABEL } from './queue-rules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JOBS_DIR = path.join(ROOT, 'automation', 'guide-jobs');
const LAST_HEALTHY_DEPLOY_PATH = path.join(ROOT, 'automation', 'status', 'last-healthy-deploy.json');
const LINK_ENGINE_REPORT_PATH = path.join(ROOT, 'automation', 'status', 'link-engine-report.json');
const CI_WORKFLOW_FILE = 'content-validation.yml';
const MAIN_BRANCH = 'main';
export const STATUS_OUTPUT_PATH = path.join(ROOT, 'ops', 'status.json');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--now') {
      args.now = argv[i + 1];
      i++;
    }
  }
  return args;
}

function loadGuideJobs() {
  if (!existsSync(JOBS_DIR)) return [];
  return readdirSync(JOBS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(JOBS_DIR, f), 'utf8')));
}

function loadLastHealthyDeploy() {
  if (!existsSync(LAST_HEALTHY_DEPLOY_PATH)) return null;
  return JSON.parse(readFileSync(LAST_HEALTHY_DEPLOY_PATH, 'utf8'));
}

/** scripts/link-engine-cli.mjs (issue #24) writes this on every run; absent until then, same as every other automation/status/ artifact. */
function loadLinkEngineReport() {
  if (!existsSync(LINK_ENGINE_REPORT_PATH)) return null;
  return JSON.parse(readFileSync(LINK_ENGINE_REPORT_PATH, 'utf8'));
}

function mapCheckRunToCiStatus(run) {
  if (!run || !run.conclusion) return 'unknown';
  return run.conclusion === 'success' ? 'passing' : 'failing';
}

/**
 * Best-effort GitHub state gather. Returns `null` (never throws) when
 * `GITHUB_TOKEN`/`GITHUB_REPOSITORY` aren't set or any call fails —
 * scripts/ops-status-builder.mjs already treats `queue`/`ci: null` as
 * "unavailable" and degrades every dependent field accordingly.
 */
async function loadGitHubState() {
  let client;
  try {
    client = clientFromEnv();
  } catch {
    console.error('GITHUB_TOKEN/GITHUB_REPOSITORY not set — queue and CI fields will report as unavailable.');
    return { queue: null, ci: null };
  }

  try {
    const [inProgressIssues, readyIssues, blockedIssues, incidentIssues, automationManagedPrs, ciRuns] =
      await Promise.all([
        client.listOpenIssuesWithLabel('in-progress'),
        client.listOpenIssuesWithLabel('ready'),
        client.listOpenIssuesWithLabel('blocked'),
        client.listOpenIssuesWithLabel(INCIDENT_LABEL),
        client.listOpenPullRequestsWithLabel('automation-managed'),
        client.listWorkflowRunsForBranch(MAIN_BRANCH, CI_WORKFLOW_FILE),
      ]);

    const activeIssue = inProgressIssues[0] || null;
    const activePr = activeIssue
      ? automationManagedPrs.find((pr) => new RegExp(`[Cc]loses #${activeIssue.number}\\b`).test(pr.body || '')) || null
      : null;

    const latestCiRun = ciRuns[0] || null;

    return {
      queue: { inProgressIssues, readyIssues, blockedIssues, incidentIssues, activePr },
      ci: latestCiRun
        ? { status: mapCheckRunToCiStatus(latestCiRun), lastRunIso: latestCiRun.updated_at || null, lastRunUrl: latestCiRun.html_url || null }
        : null,
    };
  } catch (err) {
    console.error(`GitHub API call failed — queue and CI fields will report as unavailable: ${err.message}`);
    return { queue: null, ci: null };
  }
}

export async function generateStatus({ now } = {}) {
  const statusEvents = readEvents({});
  const guideJobs = loadGuideJobs();
  let spendLedger = [];
  let imageRendererAvailable = true;
  try {
    spendLedger = readLedger({});
  } catch {
    imageRendererAvailable = false;
  }
  const lastHealthyDeploy = loadLastHealthyDeploy();
  const linkEngineReport = loadLinkEngineReport();
  const { queue, ci } = await loadGitHubState();

  return buildOpsStatus(
    { statusEvents, guideJobs, spendLedger, lastHealthyDeploy, linkEngineReport, queue, ci, imageRendererAvailable },
    { now }
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const status = await generateStatus({ now: args.now });

  const shapeCheck = validateStatusShape(status);
  if (!shapeCheck.valid) {
    console.error('Refusing to write ops/status.json — schema validation failed:');
    shapeCheck.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const secretFindings = findSecretLikeValues(status);
  if (secretFindings.length) {
    console.error('Refusing to write ops/status.json — secret-like value(s) detected:');
    secretFindings.forEach((f) => console.error(`  - ${f.path}: ${f.reason}`));
    process.exit(1);
  }

  console.log(JSON.stringify(status, null, 2));

  if (!args.dryRun) {
    mkdirSync(path.dirname(STATUS_OUTPUT_PATH), { recursive: true });
    writeFileSync(STATUS_OUTPUT_PATH, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${path.relative(ROOT, STATUS_OUTPUT_PATH)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
