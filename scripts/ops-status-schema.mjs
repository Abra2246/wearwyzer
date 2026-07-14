// Pure, dependency-free schema + security/staleness checks for the
// Mission Control ops dashboard's status artifact (issue #19). No I/O in
// this file — scripts/ops-status-builder.mjs assembles the object,
// scripts/ops-status-cli.mjs is the only file that writes `ops/status.json`
// to disk, and it refuses to write anything that fails
// `validateStatusShape` or turns up a hit in `findSecretLikeValues`.
//
// Canonical spec: docs/OPS_DASHBOARD_V1.md
//
// The dashboard is read-only observability (issue #19's product
// principle) — this schema is intentionally a *closed* shape: every
// object below rejects unknown keys, not just checks required ones are
// present. That is the structural guarantee behind "no secrets, private
// logs, or raw issue/PR content ever reach `ops/status.json`" — a field
// that isn't in this list literally cannot be written by the builder
// without failing validation first.

export const STATUS_SCHEMA_VERSION = 1;

export const HEALTH_LEVELS = Object.freeze(['green', 'yellow', 'red']);

// Mirrors the six states issue #19 section 2 asks for, matching this
// repo's existing label contract (docs/AUTOMATION_WORKFLOW.md):
// in-progress -> working, review -> review, blocked -> blocked,
// automation-failed -> failed, a nonempty ready queue with no active
// issue -> queued, otherwise idle.
export const AUTOMATION_STATES = Object.freeze(['working', 'queued', 'review', 'blocked', 'failed', 'idle']);

export const CI_STATUSES = Object.freeze(['passing', 'failing', 'unknown']);
export const DEPLOYMENT_STATUSES = Object.freeze(['healthy', 'failing', 'unknown']);
export const GUIDE_FACTORY_STATES = Object.freeze(['idle', 'in-progress', 'needs-human']);
export const IMAGE_RENDERER_STATES = Object.freeze(['idle', 'active', 'budget-exceeded', 'unavailable']);

// How old `generatedAtIso` may be before the dashboard must show "stale"
// instead of trusting the snapshot as current. Conservative on purpose —
// issue #19 section 4 asks to "clearly distinguish stale data from
// healthy idle state." Kept generous relative to the client's 60s poll
// interval because the *generator* (a scheduled workflow) runs far less
// often than the client polls.
export const DEFAULT_STALE_AFTER_MINUTES = 30;

const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'generatedAtIso',
  'overallHealth',
  'automationState',
  'activeWork',
  'queue',
  'ci',
  'deployment',
  'guideFactory',
  'imageRenderer',
  'incident',
  'blockers',
  'lastMeaningfulActivityIso',
  'staleAfterMinutes',
]);

const ACTIVE_WORK_KEYS = Object.freeze(['issueNumber', 'title', 'url', 'prNumber', 'prUrl', 'lastActivityIso']);
const QUEUE_KEYS = Object.freeze(['depth', 'readyCount', 'blockedCount']);
const CI_KEYS = Object.freeze(['status', 'lastRunIso', 'lastRunUrl']);
const DEPLOYMENT_KEYS = Object.freeze(['status', 'lastHealthyShaShort', 'lastCheckedIso']);
const GUIDE_FACTORY_KEYS = Object.freeze(['state', 'activeJobId', 'queuedCount']);
const IMAGE_RENDERER_KEYS = Object.freeze(['state', 'monthlySpendUsd', 'monthlyCapUsd', 'budgetPct']);
const INCIDENT_KEYS = Object.freeze(['active', 'issueNumber', 'summary']);
const BLOCKER_KEYS = Object.freeze(['summary', 'issueNumber', 'type']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function checkClosedShape(obj, allowedKeys, label, errors) {
  if (!isPlainObject(obj)) {
    errors.push(`${label} must be an object`);
    return;
  }
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) errors.push(`${label} has unexpected key "${key}"`);
  }
}

/**
 * Full structural validation of one `ops/status.json` document. Every
 * nested object is checked against a closed key set (see module header);
 * enums are checked against their allowed values. Returns every problem
 * found, not just the first, so a caller can log a complete picture.
 */
export function validateStatusShape(status) {
  const errors = [];
  if (!isPlainObject(status)) return { valid: false, errors: ['status is not an object'] };

  checkClosedShape(status, TOP_LEVEL_KEYS, 'status', errors);
  for (const field of TOP_LEVEL_KEYS) {
    if (field === 'activeWork') continue; // nullable, checked separately below
    if (!(field in status)) errors.push(`status is missing required field "${field}"`);
  }

  if (status.schemaVersion !== STATUS_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${STATUS_SCHEMA_VERSION}, got ${JSON.stringify(status.schemaVersion)}`);
  }
  if (!isNonEmptyString(status.generatedAtIso) || Number.isNaN(Date.parse(status.generatedAtIso))) {
    errors.push('generatedAtIso must be a valid ISO timestamp string');
  }
  if (!HEALTH_LEVELS.includes(status.overallHealth)) {
    errors.push(`overallHealth "${status.overallHealth}" must be one of ${HEALTH_LEVELS.join(', ')}`);
  }
  if (!AUTOMATION_STATES.includes(status.automationState)) {
    errors.push(`automationState "${status.automationState}" must be one of ${AUTOMATION_STATES.join(', ')}`);
  }

  if (status.activeWork !== null) {
    checkClosedShape(status.activeWork, ACTIVE_WORK_KEYS, 'activeWork', errors);
    if (isPlainObject(status.activeWork) && typeof status.activeWork.issueNumber !== 'number') {
      errors.push('activeWork.issueNumber must be a number when activeWork is set');
    }
  }

  checkClosedShape(status.queue, QUEUE_KEYS, 'queue', errors);
  if (isPlainObject(status.queue)) {
    for (const k of QUEUE_KEYS) {
      if (typeof status.queue[k] !== 'number' || status.queue[k] < 0) errors.push(`queue.${k} must be a non-negative number`);
    }
  }

  checkClosedShape(status.ci, CI_KEYS, 'ci', errors);
  if (isPlainObject(status.ci) && !CI_STATUSES.includes(status.ci.status)) {
    errors.push(`ci.status "${status.ci.status}" must be one of ${CI_STATUSES.join(', ')}`);
  }

  checkClosedShape(status.deployment, DEPLOYMENT_KEYS, 'deployment', errors);
  if (isPlainObject(status.deployment) && !DEPLOYMENT_STATUSES.includes(status.deployment.status)) {
    errors.push(`deployment.status "${status.deployment.status}" must be one of ${DEPLOYMENT_STATUSES.join(', ')}`);
  }

  checkClosedShape(status.guideFactory, GUIDE_FACTORY_KEYS, 'guideFactory', errors);
  if (isPlainObject(status.guideFactory) && !GUIDE_FACTORY_STATES.includes(status.guideFactory.state)) {
    errors.push(`guideFactory.state "${status.guideFactory.state}" must be one of ${GUIDE_FACTORY_STATES.join(', ')}`);
  }

  checkClosedShape(status.imageRenderer, IMAGE_RENDERER_KEYS, 'imageRenderer', errors);
  if (isPlainObject(status.imageRenderer) && !IMAGE_RENDERER_STATES.includes(status.imageRenderer.state)) {
    errors.push(`imageRenderer.state "${status.imageRenderer.state}" must be one of ${IMAGE_RENDERER_STATES.join(', ')}`);
  }

  checkClosedShape(status.incident, INCIDENT_KEYS, 'incident', errors);
  if (isPlainObject(status.incident) && typeof status.incident.active !== 'boolean') {
    errors.push('incident.active must be a boolean');
  }

  if (!Array.isArray(status.blockers)) {
    errors.push('blockers must be an array');
  } else {
    status.blockers.forEach((b, i) => checkClosedShape(b, BLOCKER_KEYS, `blockers[${i}]`, errors));
  }

  if (status.lastMeaningfulActivityIso !== null && !isNonEmptyString(status.lastMeaningfulActivityIso)) {
    errors.push('lastMeaningfulActivityIso must be a string or null');
  }
  if (typeof status.staleAfterMinutes !== 'number' || status.staleAfterMinutes <= 0) {
    errors.push('staleAfterMinutes must be a positive number');
  }

  return { valid: errors.length === 0, errors };
}

// Recognized credential/token prefixes. Deliberately does NOT include a
// generic "long hex/base64 string" pattern — this schema legitimately
// carries short commit SHAs (deployment.lastHealthyShaShort), and a
// generic entropy check would false-positive on those. Key-name matching
// (below) is the broader net; these patterns catch a leaked secret even
// under an innocuous-looking key name.
const SECRET_VALUE_PATTERNS = Object.freeze([
  /gh[pousr]_[A-Za-z0-9]{20,}/, // GitHub personal/OAuth/app/server/refresh tokens
  /sk-[A-Za-z0-9]{16,}/, // OpenAI-style secret keys
  /xox[baprs]-[A-Za-z0-9-]{10,}/i, // Slack tokens
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /Bearer\s+\S{10,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]);

const SECRET_KEY_NAME_PATTERN = /token|secret|password|passwd|api[_-]?key|apikey|credential|authorization/i;

/**
 * Recursively scans a value for anything that looks like a credential —
 * by key name (e.g. a field literally called `token`) or by value shape
 * (e.g. a `ghp_...` string under an innocuous key). Returns every finding
 * as `{ path, reason }`; an empty array means the value is clean.
 */
export function findSecretLikeValues(value, path = '$') {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => findings.push(...findSecretLikeValues(v, `${path}[${i}]`)));
    return findings;
  }
  if (isPlainObject(value)) {
    for (const [key, v] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (SECRET_KEY_NAME_PATTERN.test(key)) {
        findings.push({ path: childPath, reason: `key name "${key}" looks credential-related` });
      }
      findings.push(...findSecretLikeValues(v, childPath));
    }
    return findings;
  }
  if (typeof value === 'string') {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        findings.push({ path, reason: `value matches credential pattern ${pattern}` });
        break;
      }
    }
  }
  return findings;
}

/**
 * Is `generatedAtIso` old enough that the dashboard should show a stale
 * warning rather than trusting the snapshot? Pure function of the two
 * timestamps — the caller (dashboard JS or a test) always supplies `now`.
 */
export function computeStaleness(generatedAtIso, { now, staleAfterMinutes = DEFAULT_STALE_AFTER_MINUTES } = {}) {
  const nowMs = new Date(now).getTime();
  const generatedMs = new Date(generatedAtIso).getTime();
  if (Number.isNaN(nowMs) || Number.isNaN(generatedMs)) {
    return { stale: true, minutesSinceGenerated: null };
  }
  const minutesSinceGenerated = Math.max(0, (nowMs - generatedMs) / 60000);
  return { stale: minutesSinceGenerated > staleAfterMinutes, minutesSinceGenerated };
}
