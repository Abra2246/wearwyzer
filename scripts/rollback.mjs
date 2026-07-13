// Rollback / incident decision logic (issue #17, section 4). Pure
// functions only — scripts/deploy-health-check-cli.mjs is the only file
// that performs I/O (fetching routes, reading/writing the deploy ledger,
// calling the GitHub API, running git). Same split as
// scripts/queue-rules.mjs / scripts/queue-dispatch.mjs.
//
// Canonical spec: docs/AUTONOMOUS_GUIDE_FACTORY_V1.md
//
// A revert is only ever proposed as a reviewable PR — this repo's
// automation never merges anything automatically (issue #17's "do not
// enable unrestricted auto-merge" exclusion applies here too), so
// "automatically revert" is implemented as "automatically open a revert
// PR and suspend the queue," not as an unreviewed push to `main`.

/**
 * `safe` is true only when we have a recorded last-known-healthy commit
 * that differs from the commit currently deployed — i.e. there is an
 * unambiguous, single target to revert to. Without that record, a
 * revert would be a guess, so the plan degrades to incident-only.
 */
export function planRollback({ healthy, previousHealthySha, currentSha }) {
  if (healthy) {
    return { action: 'none', safe: true, reason: 'deployment is healthy' };
  }
  if (!previousHealthySha) {
    return {
      action: 'incident-only',
      safe: false,
      reason: 'no last-known-healthy deploy commit is recorded yet — cannot safely target a revert',
    };
  }
  if (previousHealthySha === currentSha) {
    return {
      action: 'incident-only',
      safe: false,
      reason: 'the last-known-healthy commit is the one currently deployed — a revert would not change anything',
    };
  }
  return {
    action: 'open-revert-pr',
    safe: true,
    reason: `reverting to last-known-healthy commit ${previousHealthySha}`,
    fromSha: currentSha,
    toSha: previousHealthySha,
  };
}

/** Deterministic branch name so repeated runs against the same failure don't create duplicate branches. */
export function buildRevertBranchName(currentSha) {
  return `automation/revert-${String(currentSha).slice(0, 12)}`;
}

/** The exact, reviewable git commands a human (or a follow-up automated step) runs to execute the plan. */
export function buildRevertCommands(plan) {
  if (plan.action !== 'open-revert-pr') return [];
  const branch = buildRevertBranchName(plan.fromSha);
  return [
    `git checkout -b ${branch} main`,
    `git revert --no-edit ${plan.fromSha}`,
    `git push -u origin ${branch}`,
    `gh pr create --base main --head ${branch} --title "Revert: production health check failure" --body-file revert-incident.md`,
  ];
}

/** Concise, actionable incident report — this is the entire body of the notification (issue #17 section 6). */
export function buildIncidentReport({ healthResult, plan, baseUrl, currentSha }) {
  const lines = [
    `**Production health check failed** for ${baseUrl}`,
    '',
    `Checked ${healthResult.checkedCount} route(s); ${healthResult.failedRoutes.length} failed:`,
    ...healthResult.failedRoutes.map((r) => `- \`${r.route}\`: ${r.problems.join('; ')}`),
    '',
    `**Deployed commit:** \`${currentSha}\``,
    `**Rollback plan:** ${plan.action} — ${plan.reason}`,
  ];
  if (plan.action === 'open-revert-pr') {
    lines.push('', '**Revert commands:**', '```', ...buildRevertCommands(plan), '```');
  }
  lines.push(
    '',
    'The automation queue is suspended (see `site-incident` label) until this issue is closed. ' +
      'See `docs/INCIDENT_RUNBOOK.md` for the full response procedure.'
  );
  return lines.join('\n');
}
