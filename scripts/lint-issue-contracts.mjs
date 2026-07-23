#!/usr/bin/env node
// Operator/CI lint for every open issue carrying the `ready` label. It uses
// the exact queue-rules validator consumed by the dispatcher and Mission
// Control, so a label can never silently imply eligibility.

import { clientFromEnv } from './queue-github-client.mjs';
import { summarizeIssueEligibility } from './queue-rules.mjs';

export function lintIssueContracts(issues) {
  const summary = summarizeIssueEligibility(issues);
  const lines = [
    `${summary.eligibleReadyCount} of ${summary.labeledReadyCount} ready-labeled issue(s) are dispatchable.`,
  ];
  for (const entry of summary.rejected) {
    lines.push(`#${entry.issue.number}: ${entry.category} — ${entry.reasons.join('; ')}`);
  }
  return {
    valid: summary.rejected.length === 0,
    summary,
    output: lines.join('\n'),
  };
}

async function main() {
  const client = clientFromEnv();
  const readyIssues = await client.listOpenIssuesWithLabel('ready');
  const result = lintIssueContracts(readyIssues);
  console.log(result.output);
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
