// Pure, dependency-free rule functions for the autonomous engineering queue.
// No I/O in this file — every function takes plain data in and returns plain
// data out, so it can be unit-tested with fixtures (scripts/__tests__/)
// without touching the network or a real repo. scripts/queue-dispatch.mjs
// and scripts/queue-pr-state.mjs are the only files that call the GitHub
// API; they hand the results through these functions to decide what to do.
//
// Canonical spec: docs/AUTONOMOUS_ENGINEERING_V1.md

export const RISK_LABELS = ['risk-low', 'risk-medium', 'risk-high'];

// Label a deployment-health-check failure adds to the incident issue it
// opens (scripts/deploy-health-check.mjs, scripts/rollback.mjs). Any open
// issue carrying this label suspends the whole dispatcher — see
// docs/AUTONOMOUS_GUIDE_FACTORY_V1.md §4.
export const INCIDENT_LABEL = 'site-incident';

// Mirrors the required textarea labels in
// .github/ISSUE_TEMPLATE/engineering-task.yml, lower-cased, as they render
// in the issue body ("### <label>").
export const REQUIRED_ISSUE_SECTIONS = [
  'objective',
  'scope',
  'exclusions',
  'acceptance criteria',
  'validation requirements',
];

export const PRIORITY_LABELS = ['priority-p0', 'priority-p1', 'priority-p2', 'priority-p3'];
export const DEFAULT_PRIORITY_LABEL = 'priority-p2';

// Files/paths a guarded low-risk auto-merge must never touch. Mirrors
// CLAUDE.md's read-only runtime files, legal pages, and workflow configs.
export const PROTECTED_PATH_PATTERNS = [
  /^\.github\/workflows\//,
  /^support\.js$/,
  /^image-slot\.js$/,
  /^privacy\.dc\.html$/,
  /^terms\.dc\.html$/,
  /^affiliate-disclosure\.dc\.html$/,
  /secret/i,
  /credential/i,
  /\.env(\..*)?$/,
];

function labelNames(labels) {
  return (labels || []).map((l) => (typeof l === 'string' ? l : l.name));
}

export function hasLabel(labels, name) {
  return labelNames(labels).includes(name);
}

/** Split a GitHub-issue-form-rendered body into { headingLower: contentText }. */
export function extractSections(body) {
  const sections = {};
  if (!body) return sections;
  const lines = body.split('\n');
  let current = null;
  let buffer = [];
  const flush = () => {
    if (current !== null) sections[current] = buffer.join('\n').trim();
  };
  for (const line of lines) {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (heading) {
      flush();
      current = heading[1].trim().toLowerCase();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

export function missingSections(body) {
  const sections = extractSections(body);
  return REQUIRED_ISSUE_SECTIONS.filter((name) => !sections[name] || sections[name].trim().length === 0);
}

/** Exactly one risk-* label must be present; returns null (malformed) otherwise. */
export function getRiskTier(labels) {
  const names = labelNames(labels);
  const present = RISK_LABELS.filter((r) => names.includes(r));
  if (present.length !== 1) return null;
  return present[0].replace('risk-', '');
}

/** Lower rank = higher priority. Unset -> DEFAULT_PRIORITY_LABEL's rank. */
export function getPriorityRank(labels) {
  const names = labelNames(labels);
  const idx = PRIORITY_LABELS.findIndex((p) => names.includes(p));
  return idx === -1 ? PRIORITY_LABELS.indexOf(DEFAULT_PRIORITY_LABEL) : idx;
}

/**
 * Validate a single candidate issue against the queue contract in
 * docs/AUTONOMOUS_ENGINEERING_V1.md. Returns { valid, riskTier,
 * priorityRank, reasons } — reasons is always populated (rejection reasons
 * when invalid, ["eligible"] when valid) so the dispatcher can log/record
 * why an issue was or wasn't picked.
 */
export function validateIssue(issue) {
  const reasons = [];
  const labels = issue.labels || [];

  if (!hasLabel(labels, 'ready')) reasons.push('missing "ready" label');
  if (hasLabel(labels, 'blocked')) reasons.push('has "blocked" label (unresolved dependency)');
  if (hasLabel(labels, 'in-progress')) reasons.push('already has "in-progress" label');

  const riskTier = getRiskTier(labels);
  if (riskTier === null) {
    reasons.push('malformed: must have exactly one risk-low/risk-medium/risk-high label');
  } else if (riskTier === 'high') {
    reasons.push('risk-high requires explicit human approval before implementation');
  }

  const missing = missingSections(issue.body);
  if (missing.length > 0) {
    reasons.push(`malformed: missing required section(s): ${missing.join(', ')}`);
  }

  return {
    valid: reasons.length === 0,
    riskTier,
    priorityRank: getPriorityRank(labels),
    reasons: reasons.length ? reasons : ['eligible'],
  };
}

/**
 * Deterministically select the single highest-priority eligible issue from
 * a list of open, `ready`-labeled issue objects ({ number, labels, body }).
 * Priority order: lowest priorityRank first (p0 beats p3), then lowest
 * issue number (oldest first) as a stable tiebreaker.
 */
export function selectNextIssue(issues) {
  const evaluated = (issues || []).map((issue) => ({ issue, ...validateIssue(issue) }));
  const eligible = evaluated.filter((e) => e.valid);
  eligible.sort((a, b) => a.priorityRank - b.priorityRank || a.issue.number - b.issue.number);
  return {
    selected: eligible[0] || null,
    evaluated,
  };
}

/**
 * Can the dispatcher run at all, or does active work already occupy the
 * queue? An open `site-incident` issue always takes priority over every
 * other gate and suspends dispatch entirely, regardless of in-progress
 * work or open PRs — a production incident must be resolved by a human
 * before any further automated change goes out (issue #17 §4).
 */
export function canDispatch({ inProgressIssues = [], openAutomationManagedPrs = [], openIncidentIssues = [] } = {}) {
  if (openIncidentIssues.length > 0) {
    return {
      allowed: false,
      reason: `queue suspended: open "${INCIDENT_LABEL}" issue #${openIncidentIssues[0].number} must be resolved first`,
    };
  }
  if (inProgressIssues.length > 0) {
    return { allowed: false, reason: `issue #${inProgressIssues[0].number} is already "in-progress"` };
  }
  if (openAutomationManagedPrs.length > 0) {
    return {
      allowed: false,
      reason: `PR #${openAutomationManagedPrs[0].number} is an open "automation-managed" PR`,
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Compute the dispatch plan without performing any I/O — this is why the
 * plan is identical for a dry run and a live run; only the caller decides
 * whether to execute it.
 */
export function planDispatch({ inProgressIssues, openAutomationManagedPrs, openIncidentIssues, readyIssues }) {
  const gate = canDispatch({ inProgressIssues, openAutomationManagedPrs, openIncidentIssues });
  if (!gate.allowed) {
    return { type: 'noop', reason: gate.reason };
  }
  const { selected, evaluated } = selectNextIssue(readyIssues);
  if (!selected) {
    return { type: 'noop', reason: 'no eligible ready issue', evaluated };
  }
  return {
    type: 'dispatch',
    issue: selected.issue,
    riskTier: selected.riskTier,
    reason: `highest-priority eligible issue (priority rank ${selected.priorityRank}, #${selected.issue.number})`,
    evaluated,
  };
}

const LINKING_KEYWORD_RE = /\b(close[sd]?|fixe?[sd]?|resolve[sd]?)\s*:?\s*#(\d+)/gi;

/** GitHub's own "Closes #N" / "Fixes #N" / "Resolves #N" auto-link vocabulary. */
export function extractLinkedIssueNumbers(prBody) {
  if (!prBody) return [];
  const numbers = new Set();
  let match;
  while ((match = LINKING_KEYWORD_RE.exec(prBody)) !== null) {
    numbers.add(Number(match[2]));
  }
  return [...numbers];
}

/** Should this PR move its linked automation-managed issue from in-progress to review? */
export function determinePrSyncAction({ issueLabels, prIsDraft, prState }) {
  if (prState === 'closed') return { type: 'noop', reason: 'PR is closed' };
  if (!hasLabel(issueLabels, 'automation-managed')) {
    return { type: 'noop', reason: 'issue is not automation-managed' };
  }
  if (prIsDraft) return { type: 'noop', reason: 'PR is still a draft' };
  if (!hasLabel(issueLabels, 'in-progress')) {
    return { type: 'noop', reason: 'issue is not in-progress' };
  }
  return { type: 'move-to-review' };
}

/** What to do when an implementation run could not complete. */
export function determineFailureAction({ issueLabels }) {
  if (!hasLabel(issueLabels, 'automation-managed')) {
    return { type: 'noop', reason: 'issue is not automation-managed' };
  }
  return {
    type: 'mark-failed',
    removeLabels: ['in-progress'],
    addLabels: ['automation-failed', 'needs-human'],
  };
}

export function touchesProtectedPath(changedFiles) {
  return (changedFiles || []).some((file) => PROTECTED_PATH_PATTERNS.some((re) => re.test(file)));
}

/**
 * Guarded low-risk auto-merge gate. Disabled by default: `featureFlagEnabled`
 * must be explicitly true — driven by the AUTOMATION_AUTO_MERGE_ENABLED
 * repository variable (see docs/AUTOMATION_WORKFLOW.md) — on top of every
 * other condition being met. Reporting only; nothing in this repo currently
 * calls a merge API even when this returns eligible: true (see
 * scripts/queue-pr-state.mjs).
 */
export function evaluateAutoMergeEligibility({
  issueLabels = [],
  prLabels = [],
  prIsDraft = true,
  requiredChecksPassed = false,
  changedFiles = [],
  unresolvedReviewThreadCount = 1,
  featureFlagEnabled = false,
} = {}) {
  const reasons = [];
  if (!hasLabel(issueLabels, 'automation-managed') || !hasLabel(issueLabels, 'risk-low')) {
    reasons.push('issue is not labeled automation-managed + risk-low');
  }
  if (!hasLabel(prLabels, 'automation-managed') || !hasLabel(prLabels, 'risk-low')) {
    reasons.push('PR is not labeled automation-managed + risk-low');
  }
  if (prIsDraft) reasons.push('PR is a draft');
  if (!requiredChecksPassed) reasons.push('required status checks have not all succeeded');
  if (touchesProtectedPath(changedFiles)) reasons.push('PR touches a protected path');
  if (unresolvedReviewThreadCount > 0) {
    reasons.push(`${unresolvedReviewThreadCount} unresolved review thread(s)`);
  }
  if (!featureFlagEnabled) reasons.push('AUTOMATION_AUTO_MERGE_ENABLED feature flag is not enabled');

  return {
    eligible: reasons.length === 0,
    reasons: reasons.length ? reasons : ['all gate conditions satisfied'],
  };
}
