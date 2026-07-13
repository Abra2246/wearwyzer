// Shared fixtures for scripts/__tests__/*.test.mjs — deterministic sample
// issues/PRs so tests never hit the network or a real repo.

export function makeIssue({ number, labels, body, title = `Issue #${number}` } = {}) {
  return { number, title, labels: labels.map((name) => ({ name })), body };
}

export const COMPLETE_BODY = `
### Objective
Do the thing.

### Scope
Only these files.

### Exclusions
Not that.

### Acceptance criteria
- [ ] It works

### Validation requirements
Run the validators.

### Risk tier
Low — content/copy only, single page or data entry, no shared files
`;

export const MISSING_ACCEPTANCE_CRITERIA_BODY = `
### Objective
Do the thing.

### Scope
Only these files.

### Exclusions
Not that.

### Validation requirements
Run the validators.
`;

export const READY_LOW_RISK_ISSUE = makeIssue({
  number: 101,
  labels: ['ready', 'risk-low', 'priority-p2'],
  body: COMPLETE_BODY,
});

export const READY_HIGH_PRIORITY_ISSUE = makeIssue({
  number: 102,
  labels: ['ready', 'risk-medium', 'priority-p0'],
  body: COMPLETE_BODY,
});

export const READY_HIGH_RISK_ISSUE = makeIssue({
  number: 103,
  labels: ['ready', 'risk-high', 'priority-p0'],
  body: COMPLETE_BODY,
});

export const MALFORMED_ISSUE = makeIssue({
  number: 104,
  labels: ['ready', 'risk-low'],
  body: MISSING_ACCEPTANCE_CRITERIA_BODY,
});

export const MALFORMED_NO_RISK_LABEL_ISSUE = makeIssue({
  number: 105,
  labels: ['ready'],
  body: COMPLETE_BODY,
});
