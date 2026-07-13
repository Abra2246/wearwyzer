// Notification-by-exception contract (issue #17, section 6). Pure
// classification/formatting only — scripts/notify-exception-cli.mjs (or
// any caller with a GitHub client) is responsible for actually creating
// the issue/comment or appending to the dashboard log.
//
// Canonical spec: docs/AUTONOMOUS_GUIDE_FACTORY_V1.md
//
// The operating principle (issue #17): routine successes are logged,
// never sent as an interruptive alert. Only the six categories below —
// plus anything a caller doesn't recognize, fail-safe — ever notify a
// human.

export const EXCEPTION_TYPES = Object.freeze([
  'deploy-health-failure',
  'automation-blocked-after-retries',
  'ambiguous-editorial-decision',
  'protected-path-or-high-risk',
  'missing-or-expired-credential',
  'unverifiable-product-facts',
]);

export const ROUTINE_TYPES = Object.freeze(['routine-success']);

const LABELS_BY_TYPE = Object.freeze({
  'deploy-health-failure': ['needs-human', 'site-incident'],
  'automation-blocked-after-retries': ['needs-human', 'automation-failed'],
  'ambiguous-editorial-decision': ['needs-human'],
  'protected-path-or-high-risk': ['needs-human', 'risk-high'],
  'missing-or-expired-credential': ['needs-human'],
  'unverifiable-product-facts': ['needs-human'],
});

/**
 * Fail-safe classification: any event type this module doesn't
 * recognize is treated as notify-worthy rather than silently dropped —
 * an unknown event is exactly the kind of ambiguity this contract exists
 * to surface, not swallow.
 */
export function classifyEvent(event) {
  const type = event && event.type;
  if (ROUTINE_TYPES.includes(type)) {
    return { shouldNotify: false, logOnly: true, type };
  }
  const recognized = EXCEPTION_TYPES.includes(type);
  return {
    shouldNotify: true,
    logOnly: false,
    type: type || 'unclassified-event',
    labels: recognized ? LABELS_BY_TYPE[type] : ['needs-human'],
    fallback: !recognized,
  };
}

/** One concise, actionable title+body — never a raw dump of internal state. */
export function buildNotification(event) {
  const classification = classifyEvent(event);
  const summary = event.summary || '(no summary provided)';
  const title = `[${classification.fallback ? 'unclassified' : classification.type}] ${summary}`.slice(0, 120);
  const bodyLines = [summary, ''];
  if (event.detail) bodyLines.push(event.detail, '');
  if (event.nextAction) bodyLines.push(`**Next action:** ${event.nextAction}`);
  return {
    title,
    body: bodyLines.join('\n').trim(),
    labels: classification.labels || ['needs-human'],
  };
}
