#!/usr/bin/env node
// Post-deploy health check + rollback orchestration CLI (issue #17,
// section 4). Dependency-free Node ESM, same style as
// scripts/queue-dispatch.mjs. Wires together scripts/deploy-health-check.mjs
// (pure route checks) and scripts/rollback.mjs (pure rollback decision)
// with the minimal I/O each needs: fetching the deployed site, reading/
// writing a small JSON ledger of the last known-healthy commit, and
// opening a `site-incident` issue via the existing queue GitHub client.
//
// Usage:
//   node scripts/deploy-health-check-cli.mjs --base-url https://www.wearwyzer.com --sha <commit> [--dry-run]
//
// Requires GITHUB_TOKEN + GITHUB_REPOSITORY only to open the incident
// issue on failure — a successful run needs neither.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkRoutes, evaluateDeploymentHealth, DEFAULT_CRITICAL_ROUTES } from './deploy-health-check.mjs';
import { planRollback, buildIncidentReport, buildRevertCommands } from './rollback.mjs';
import { clientFromEnv } from './queue-github-client.mjs';
import { appendEvent } from './record-status-event.mjs';
import { buildStatusEvent } from './status-log.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LEDGER_PATH = path.join(ROOT, 'automation', 'status', 'last-healthy-deploy.json');

function readLedger() {
  if (!existsSync(LEDGER_PATH)) return { previousHealthySha: null };
  return JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
}

function writeLedger(ledger) {
  mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
}

function parseArgs(argv) {
  const args = { routes: DEFAULT_CRITICAL_ROUTES };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--base-url') args.baseUrl = argv[++i];
    else if (a === '--sha') args.sha = argv[++i];
    else if (a === '--routes') args.routes = argv[++i].split(',');
  }
  return args;
}

export async function runHealthCheck({ baseUrl, sha, routes = DEFAULT_CRITICAL_ROUTES, dryRun = false, now }) {
  const nowIso = now || new Date().toISOString();
  const routeResults = await checkRoutes(baseUrl, routes);
  const healthResult = evaluateDeploymentHealth(routeResults);
  const ledger = readLedger();

  if (healthResult.healthy) {
    if (!dryRun) {
      writeLedger({ previousHealthySha: sha, checkedAt: nowIso });
      appendEvent(
        buildStatusEvent({
          timestampIso: nowIso,
          kind: 'routine',
          type: 'deploy-health-check-passed',
          summary: `Deploy ${sha} passed health check (${healthResult.checkedCount} routes).`,
        })
      );
    }
    console.log(`✓ Deployment healthy — ${healthResult.checkedCount} route(s) checked.`);
    return { healthResult, plan: { action: 'none', safe: true, reason: 'healthy' } };
  }

  const plan = planRollback({ healthy: false, previousHealthySha: ledger.previousHealthySha, currentSha: sha });
  const report = buildIncidentReport({ healthResult, plan, baseUrl, currentSha: sha });

  console.error('✗ Deployment health check FAILED.');
  console.error(report);

  if (!dryRun) {
    const client = clientFromEnv();
    const issue = await client.request('POST', `/repos/${client.owner}/${client.repo}/issues`, {
      title: `Site incident: production health check failed (${sha.slice(0, 12)})`,
      body: report,
      labels: ['site-incident', 'needs-human'],
    });
    appendEvent(
      buildStatusEvent({
        timestampIso: nowIso,
        kind: 'exception',
        type: 'deploy-health-failure',
        summary: `Deploy ${sha} failed health check — incident #${issue.number} opened, queue suspended.`,
        detail: plan.reason,
      })
    );
    console.error(`Opened incident issue #${issue.number}. Queue is suspended until it is closed.`);
  } else {
    console.error('[dry-run] would open a site-incident issue and suspend the queue.');
    if (plan.action === 'open-revert-pr') {
      console.error('[dry-run] revert commands:\n' + buildRevertCommands(plan).join('\n'));
    }
  }

  return { healthResult, plan };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baseUrl || !args.sha) {
    console.error('Usage: node scripts/deploy-health-check-cli.mjs --base-url <url> --sha <commit> [--routes a,b,c] [--dry-run]');
    process.exit(1);
  }
  const { healthResult } = await runHealthCheck(args);
  process.exit(healthResult.healthy ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
