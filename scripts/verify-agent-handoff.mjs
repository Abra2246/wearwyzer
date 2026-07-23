#!/usr/bin/env node
// Immediate queue-run postcondition. Unlike the scheduled watchdog, this
// runs in the same Claude workflow and fails that workflow before a false
// green result can be recorded.

import { appendFileSync, readFileSync } from 'node:fs';
import { clientFromEnv } from './queue-github-client.mjs';
import { branchPrefixForIssue } from './handoff-watchdog-rules.mjs';
import { countPermissionDenials, evaluateAgentHandoff } from './agent-handoff-rules.mjs';

function parseArgs(argv) {
  const index = argv.indexOf('--issue');
  const issueNumber = index >= 0 ? Number(argv[index + 1]) : NaN;
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('verify-agent-handoff requires --issue <positive integer>');
  }
  const executionIndex = argv.indexOf('--execution-file');
  return {
    issueNumber,
    executionFile: executionIndex >= 0 ? argv[executionIndex + 1] : null,
  };
}

export function permissionDenialCountFromFile(filePath) {
  if (!filePath) return null;
  try {
    const text = readFileSync(filePath, 'utf8');
    try {
      return countPermissionDenials(JSON.parse(text));
    } catch {
      let maximum = null;
      for (const line of text.split('\n').filter(Boolean)) {
        try {
          const count = countPermissionDenials(JSON.parse(line));
          if (count !== null) maximum = Math.max(maximum ?? 0, count);
        } catch {
          // Ignore non-JSON progress lines; never echo their content.
        }
      }
      return maximum;
    }
  } catch {
    return null;
  }
}

function writeSafeOutputs(permissionDenialCount, env = process.env) {
  if (!env.GITHUB_OUTPUT) return;
  appendFileSync(
    env.GITHUB_OUTPUT,
    `permission_denial_count=${permissionDenialCount === null ? 'unknown' : permissionDenialCount}\n`
  );
}

export async function verifyAgentHandoff(client, issueNumber) {
  const issue = await client.getIssue(issueNumber);
  const branchRefs = await client.listMatchingBranchRefs(branchPrefixForIssue(issueNumber));
  const implementationBranches = await Promise.all(
    branchRefs.map(async (branch) => ({
      ...branch,
      changedFiles: await client.compareCommits('main', branch.name),
    }))
  );
  const linkedPullRequests = [];
  for (const branch of branchRefs) {
    linkedPullRequests.push(...await client.listOpenPullRequestsForBranch(branch.name));
  }
  const issueComments = await client.listIssueComments(issueNumber);
  const result = evaluateAgentHandoff({
    linkedPullRequests,
    implementationBranches,
    issueLabels: issue.labels,
    issueComments,
  });

  console.log(`Issue #${issueNumber} handoff: ${result.valid ? 'valid' : 'INVALID'} — ${result.detail}`);
  return result;
}

async function main() {
  const { issueNumber, executionFile } = parseArgs(process.argv.slice(2));
  const permissionDenialCount = permissionDenialCountFromFile(executionFile);
  writeSafeOutputs(permissionDenialCount);
  console.log(
    `Claude permission denials: ${permissionDenialCount === null ? 'not safely available' : permissionDenialCount}`
  );
  const result = await verifyAgentHandoff(clientFromEnv(), issueNumber);
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
