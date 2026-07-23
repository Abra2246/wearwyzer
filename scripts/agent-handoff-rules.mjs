// Pure postcondition rules for a queue-dispatched implementation run.
// A workflow may report success only when it leaves evidence another
// operator can continue from: a linked PR, a non-empty issue branch, or an
// explicit evidence-backed blocker recorded on the issue.

export const BLOCKER_MARKER = '<!-- automation-handoff:evidence-backed-blocker -->';

function labelNames(labels = []) {
  return labels.map((label) => (typeof label === 'string' ? label : label.name));
}

/** Return only a denial count; never return or log model output or tool arguments. */
export function countPermissionDenials(value) {
  let maximum = null;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (key === 'permission_denials_count' && Number.isInteger(child) && child >= 0) {
        maximum = Math.max(maximum ?? 0, child);
      } else if (key === 'permission_denials' && Array.isArray(child)) {
        maximum = Math.max(maximum ?? 0, child.length);
      }
      visit(child);
    }
  };
  visit(value);
  return maximum;
}

export function evaluateAgentHandoff({
  linkedPullRequests = [],
  implementationBranches = [],
  issueLabels = [],
  issueComments = [],
} = {}) {
  if (linkedPullRequests.length > 0) {
    return {
      valid: true,
      evidence: 'pull-request',
      detail: `PR #${linkedPullRequests[0].number} is linked to the issue.`,
    };
  }

  const nonEmptyBranch = implementationBranches.find(
    (branch) => Array.isArray(branch.changedFiles) && branch.changedFiles.length > 0
  );
  if (nonEmptyBranch) {
    return {
      valid: true,
      evidence: 'implementation-branch',
      detail: `Branch ${nonEmptyBranch.name} contains ${nonEmptyBranch.changedFiles.length} changed file(s).`,
    };
  }

  const labels = labelNames(issueLabels);
  const blockerComment = issueComments.find((comment) =>
    String(comment.body || '').includes(BLOCKER_MARKER)
  );
  if (
    blockerComment
    && labels.includes('blocked')
    && labels.includes('needs-human')
    && !labels.includes('in-progress')
  ) {
    return {
      valid: true,
      evidence: 'evidence-backed-blocker',
      detail: 'Issue is blocked, needs human input, and includes the structured blocker marker.',
    };
  }

  const reasons = [];
  if (implementationBranches.length > 0) {
    reasons.push('matching branch exists but contains no changes from main');
  } else {
    reasons.push('no matching implementation branch');
  }
  reasons.push('no linked pull request');
  if (!blockerComment) reasons.push('no structured blocker comment');
  if (!labels.includes('blocked') || !labels.includes('needs-human') || labels.includes('in-progress')) {
    reasons.push('issue labels do not describe a completed blocker handoff');
  }
  return { valid: false, evidence: null, detail: reasons.join('; ') };
}
