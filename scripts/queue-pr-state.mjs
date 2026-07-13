#!/usr/bin/env node
// Moves an automation-managed issue from `in-progress` to `review` when its
// implementation PR opens/becomes ready, and marks `automation-failed` +
// `needs-human` when a run cannot complete. Also evaluates — but never
// executes — the guarded low-risk auto-merge gate (reporting only; see
// docs/AUTONOMOUS_ENGINEERING_V1.md "Guarded low-risk auto-merge design").
//
// Usage:
//   node scripts/queue-pr-state.mjs sync --pr <number> [--dry-run]
//   node scripts/queue-pr-state.mjs mark-failed --issue <number> --reason "<text>" [--dry-run]
//
// Requires GITHUB_TOKEN + GITHUB_REPOSITORY in the environment.

import { clientFromEnv } from './queue-github-client.mjs';
import {
  determinePrSyncAction,
  determineFailureAction,
  evaluateAutoMergeEligibility,
  extractLinkedIssueNumbers,
} from './queue-rules.mjs';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--')) {
      args[a.slice(2)] = argv[i + 1];
      i++;
    } else args._.push(a);
  }
  return args;
}

export async function syncPr(client, prNumber, { dryRun = false } = {}) {
  const pr = await client.getPullRequest(prNumber);
  const issueNumbers = extractLinkedIssueNumbers(pr.body);
  if (issueNumbers.length === 0) {
    console.log(`PR #${prNumber} does not reference an issue via "Closes #N" — nothing to sync.`);
    return [{ type: 'noop', reason: 'no linked issue' }];
  }

  const results = [];
  for (const issueNumber of issueNumbers) {
    const issue = await client.getIssue(issueNumber);
    const action = determinePrSyncAction({
      issueLabels: issue.labels,
      prIsDraft: pr.draft,
      prState: pr.state,
    });

    if (action.type === 'move-to-review') {
      console.log(`${dryRun ? '[dry-run] ' : ''}Issue #${issueNumber}: in-progress -> review (PR #${prNumber})`);
      if (!dryRun) {
        await client.removeLabel(issueNumber, 'in-progress');
        await client.addLabels(issueNumber, ['review']);
        await client.createComment(
          issueNumber,
          `Implementation PR #${prNumber} is open and ready for review. Moving this issue from ` +
            '`in-progress` to `review`.'
        );
      }
    } else {
      console.log(`Issue #${issueNumber}: no-op — ${action.reason}`);
    }

    if (!pr.draft) {
      const [changedFiles, requiredChecksPassed, unresolvedReviewThreadCount] = await Promise.all([
        client.listChangedFiles(prNumber),
        client.getCombinedChecksPassed(pr.head.sha).catch(() => false),
        client.getUnresolvedReviewThreadCount(prNumber).catch(() => 1),
      ]);
      const gate = evaluateAutoMergeEligibility({
        issueLabels: issue.labels,
        prLabels: pr.labels,
        prIsDraft: pr.draft,
        requiredChecksPassed,
        changedFiles,
        unresolvedReviewThreadCount,
        featureFlagEnabled: process.env.AUTOMATION_AUTO_MERGE_ENABLED === 'true',
      });
      console.log(
        `PR #${prNumber} low-risk auto-merge gate: ${gate.eligible ? 'ELIGIBLE' : 'blocked'} — ` +
          gate.reasons.join('; ')
      );
      // v1 intentionally never calls a merge API here, even when eligible
      // and the flag is enabled — see docs/AUTONOMOUS_ENGINEERING_V1.md
      // "Guarded low-risk auto-merge design" and this epic's exclusion on
      // unrestricted auto-merge. This is reporting-only.
    }

    results.push({ issueNumber, action });
  }
  return results;
}

export async function markFailed(client, issueNumber, reason, { dryRun = false } = {}) {
  const issue = await client.getIssue(issueNumber);
  const action = determineFailureAction({ issueLabels: issue.labels });
  if (action.type === 'noop') {
    console.log(`Issue #${issueNumber}: no-op — ${action.reason}`);
    return action;
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}Issue #${issueNumber}: marking automation-failed / needs-human`);
  if (!dryRun) {
    await client.removeLabel(issueNumber, 'in-progress');
    await client.addLabels(issueNumber, action.addLabels);
    await client.createComment(
      issueNumber,
      `Automation could not complete this issue and needs a human to take over.\n\n**Reason:** ${reason}`
    );
  }
  return action;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const client = clientFromEnv();

  if (command === 'sync') {
    if (!args.pr) throw new Error('sync requires --pr <number>');
    await syncPr(client, Number(args.pr), { dryRun: !!args.dryRun });
  } else if (command === 'mark-failed') {
    if (!args.issue) throw new Error('mark-failed requires --issue <number>');
    await markFailed(client, Number(args.issue), args.reason || '(no reason given)', { dryRun: !!args.dryRun });
  } else {
    console.error('Usage: node scripts/queue-pr-state.mjs <sync --pr N | mark-failed --issue N --reason "...">');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
