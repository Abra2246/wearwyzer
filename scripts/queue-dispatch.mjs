#!/usr/bin/env node
// Autonomous engineering queue dispatcher (v1). Dependency-free Node ESM.
// Claims at most one `ready` issue per invocation and hands it to Claude
// through the existing Claude Code workflow's explicit workflow_dispatch
// entry point. See
// docs/AUTONOMOUS_ENGINEERING_V1.md for the full contract and
// docs/AUTOMATION_WORKFLOW.md for how this is wired into a scheduled
// workflow.
//
// Usage:
//   node scripts/queue-dispatch.mjs [--dry-run]
//
// Requires GITHUB_TOKEN + GITHUB_REPOSITORY in the environment. No new
// secret is introduced — this uses the workflow's own GITHUB_TOKEN.

import { clientFromEnv } from './queue-github-client.mjs';
import { planDispatch, INCIDENT_LABEL } from './queue-rules.mjs';

export function buildDispatchComment({ issue, riskTier, reason }) {
  return [
    'Implementation dispatched to the Claude Code workflow.',
    '',
    '**Automation dispatch record**',
    `- Risk tier: \`${riskTier}\``,
    `- Selection reason: ${reason}`,
    `- Next expected event: an implementation PR labeled \`automation-managed\` referencing this issue ` +
      `(\`Closes #${issue.number}\`), which moves this issue from \`in-progress\` to \`review\`.`,
    '',
    "Follow `CLAUDE.md`, `CONTRIBUTING.md`, and this issue's own scope/exclusions/acceptance criteria " +
      'exactly. Open a PR into `main` and stop for human review — do not merge.',
  ].join('\n');
}

export async function loadState(client) {
  const [inProgressIssues, openAutomationManagedPrs, readyIssues, openIncidentIssues] = await Promise.all([
    client.listOpenIssuesWithLabel('in-progress'),
    client.listOpenPullRequestsWithLabel('automation-managed'),
    client.listOpenIssuesWithLabel('ready'),
    client.listOpenIssuesWithLabel(INCIDENT_LABEL),
  ]);
  return { inProgressIssues, openAutomationManagedPrs, readyIssues, openIncidentIssues };
}

export async function dispatch(client, { dryRun = false } = {}) {
  const state = await loadState(client);
  const plan = planDispatch(state);

  if (plan.type === 'noop') {
    console.log(`No-op: ${plan.reason}`);
    if (plan.evaluated) {
      for (const e of plan.evaluated) {
        console.log(`  #${e.issue.number}: ${e.valid ? 'eligible' : 'rejected'} — ${e.reasons.join('; ')}`);
      }
    }
    return plan;
  }

  const comment = buildDispatchComment(plan);
  console.log(
    `${dryRun ? '[dry-run] ' : ''}Dispatching #${plan.issue.number} (risk: ${plan.riskTier}) — ${plan.reason}`
  );

  if (!dryRun) {
    await client.removeLabel(plan.issue.number, 'ready');
    await client.addLabels(plan.issue.number, ['in-progress', 'automation-managed']);
    try {
      await client.createComment(plan.issue.number, comment);
      await client.dispatchWorkflow('claude.yml', {
        ref: 'main',
        inputs: { issue_number: String(plan.issue.number) },
      });
    } catch (err) {
      // Fail closed: a claimed issue must not remain falsely in-progress when
      // the downstream implementation workflow never started.
      await client.removeLabel(plan.issue.number, 'in-progress');
      await client.removeLabel(plan.issue.number, 'automation-managed');
      await client.addLabels(plan.issue.number, ['ready', 'automation-failed', 'needs-human']);
      try {
        await client.createComment(
          plan.issue.number,
          [
            '<!-- automation-direct-dispatch-failed -->',
            '**Automation dispatch failed before implementation started.**',
            '',
            'The issue was returned to `ready` and marked `automation-failed` + `needs-human`.',
            'Next action: inspect the Automation Queue Dispatcher run, repair the direct workflow dispatch, and retry.',
          ].join('\n')
        );
      } catch {
        // Preserve the original error; the workflow log is still the source
        // of truth if even the failure comment cannot be created.
      }
      throw new Error(`Failed to start Claude workflow for issue #${plan.issue.number}: ${err.message}`);
    }
  } else {
    console.log('[dry-run] would remove label: ready');
    console.log('[dry-run] would add labels: in-progress, automation-managed');
    console.log(`[dry-run] would post comment:\n${comment}`);
    console.log(`[dry-run] would dispatch claude.yml for issue #${plan.issue.number}`);
  }

  return plan;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const client = clientFromEnv();
  await dispatch(client, { dryRun });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
