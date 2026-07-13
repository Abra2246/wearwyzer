#!/usr/bin/env node
// Idempotently creates/updates the autonomous engineering queue's label
// contract (docs/AUTONOMOUS_ENGINEERING_V1.md). Never deletes or renames a
// label it doesn't own — existing repo labels outside this contract are
// left alone.
//
// Usage:
//   node scripts/queue-labels.mjs [--dry-run]
//
// Requires GITHUB_TOKEN + GITHUB_REPOSITORY in the environment (set
// automatically inside GitHub Actions; export them manually for a local
// run against a real repo — no new secret is introduced).

import { clientFromEnv } from './queue-github-client.mjs';

export const LABEL_CONTRACT = [
  { name: 'ready', color: '0E8A16', description: 'Eligible for the automation dispatcher to claim next.' },
  {
    name: 'in-progress',
    color: 'FBCA04',
    description: 'Claimed by the automation dispatcher; implementation underway.',
  },
  { name: 'review', color: '1D76DB', description: 'Implementation PR is open and awaiting human review.' },
  { name: 'blocked', color: 'B60205', description: 'Cannot proceed until a dependency or decision is resolved.' },
  {
    name: 'needs-human',
    color: 'D93F0B',
    description: 'Automation stopped short; a human must take the next action.',
  },
  {
    name: 'automation-failed',
    color: '5319E7',
    description: 'An automated implementation run did not complete.',
  },
  {
    name: 'automation-managed',
    color: 'BFD4F2',
    description: 'Tracked by the autonomous engineering queue (docs/AUTONOMOUS_ENGINEERING_V1.md).',
  },
  {
    name: 'site-incident',
    color: 'B60205',
    description: 'Production health check failed. Suspends the queue until resolved (docs/AUTONOMOUS_GUIDE_FACTORY_V1.md).',
  },
  {
    name: 'risk-low',
    color: 'C2E0C6',
    description: 'Low blast radius — eligible for the guarded low-risk auto-merge path.',
  },
  {
    name: 'risk-medium',
    color: 'FEF2C0',
    description: 'Medium blast radius — implementation PR must stop before merge.',
  },
  {
    name: 'risk-high',
    color: 'E99695',
    description: 'High blast radius — requires explicit human approval before implementation.',
  },
  { name: 'priority-p0', color: 'B60205', description: 'Highest dispatch priority.' },
  { name: 'priority-p1', color: 'D93F0B', description: 'High dispatch priority.' },
  { name: 'priority-p2', color: 'FBCA04', description: 'Normal dispatch priority (default when unset).' },
  { name: 'priority-p3', color: 'C5DEF5', description: 'Low dispatch priority.' },
];

export async function syncLabels(client, { dryRun = false } = {}) {
  const existing = await client.listLabels();
  const byName = new Map(existing.map((l) => [l.name, l]));
  const summary = { created: [], updated: [], unchanged: [] };

  for (const label of LABEL_CONTRACT) {
    const current = byName.get(label.name);
    if (!current) {
      summary.created.push(label.name);
      if (!dryRun) await client.createLabel(label);
      continue;
    }
    const needsUpdate = current.color !== label.color || (current.description || '') !== label.description;
    if (needsUpdate) {
      summary.updated.push(label.name);
      if (!dryRun) await client.updateLabel(label.name, label);
    } else {
      summary.unchanged.push(label.name);
    }
  }
  return summary;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const client = clientFromEnv();
  const summary = await syncLabels(client, { dryRun });
  console.log(`${dryRun ? '[dry-run] ' : ''}Label sync complete.`);
  console.log(`  created:   ${summary.created.join(', ') || '(none)'}`);
  console.log(`  updated:   ${summary.updated.join(', ') || '(none)'}`);
  console.log(`  unchanged: ${summary.unchanged.join(', ') || '(none)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
