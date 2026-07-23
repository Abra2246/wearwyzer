// Pure, dependency-free schema for Mission Control v2's live-data document
// (issue #42). No I/O in this file — scripts/ops-live-builder.mjs assembles
// the object, scripts/ops-live-cli.mjs is the only file that writes
// `ops/live-feed.json` to disk, and it refuses to write anything that fails
// `validateLiveFeedShape` or turns up a hit in the shared secret scanner.
//
// Canonical spec: docs/OPS_DASHBOARD_V2.md
//
// This is a second, additive document alongside ops/status.json
// (docs/OPS_DASHBOARD_V1.md) — v1 keeps running unchanged. The schema is
// closed the same way ops-status-schema.mjs is: every nested object rejects
// unknown keys, not just checks required ones are present.

import { findSecretLikeValues } from './ops-status-schema.mjs';

export { findSecretLikeValues };

export const LIVE_SCHEMA_VERSION = 1;

// Per-source freshness state (issue #42: "unknown, delayed, fallback, and
// offline states must be explicit" / "no fake green"). `live` = the source
// was queried successfully within its own staleAfterMinutes window;
// `delayed` = we have data (possibly last-known-good) but it's older than
// that; `offline` = no usable data at all, ever, or too old to trust.
export const SOURCE_STATES = Object.freeze(['live', 'delayed', 'offline']);
export const OVERALL_STATES = Object.freeze(['live', 'delayed', 'offline']);
export const NOT_WIRED_STATE = 'not-wired';

export const AUTOMATION_STATES = Object.freeze(['working', 'queued', 'review', 'blocked', 'failed', 'idle']);
export const CI_STATUSES = Object.freeze(['passing', 'failing', 'unknown']);
export const DEPLOYMENT_STATUSES = Object.freeze(['healthy', 'failing', 'unknown']);

// Every source's own freshness thresholds. Engineering and deployment are
// both queried on every generator run, so both use "how old is our last
// successful read" — not "how long since the underlying event happened"
// (a quiet deployment for three days is healthy, not stale; see
// docs/OPS_DASHBOARD_V2.md "Per-source freshness vs. event recency").
export const DEFAULT_THRESHOLDS = Object.freeze({
  engineering: Object.freeze({ staleAfterMinutes: 10, offlineAfterMinutes: 45 }),
  deployment: Object.freeze({ staleAfterMinutes: 15, offlineAfterMinutes: 60 }),
});

export const MAX_AUTOMATION_FEED_EVENTS = 50;

const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'generatedAtIso',
  'overallState',
  'ceo',
  'sources',
  'automationFeed',
]);

const CEO_KEYS = Object.freeze(['headline', 'requiredAction', 'activeWorkSummary']);
const SOURCE_KEYS = Object.freeze(['wired', 'state', 'lastUpdatedIso', 'fetchOk', 'data', 'note']);
const SOURCE_NAMES = Object.freeze(['engineering', 'deployment', 'content', 'image', 'affiliate']);
const CRITICAL_SOURCE_NAMES = Object.freeze(['engineering', 'deployment']);

const ENGINEERING_DATA_KEYS = Object.freeze(['automationState', 'activeIssue', 'queue', 'pr', 'ci', 'handoff']);
const ACTIVE_ISSUE_KEYS = Object.freeze(['number', 'title', 'url', 'updatedIso']);
const QUEUE_KEYS = Object.freeze([
  'depth',
  'readyCount',
  'labeledReadyCount',
  'eligibleReadyCount',
  'malformedCount',
  'riskGatedCount',
  'dependencyBlockedCount',
  'blockedCount',
  'stalledSinceIso',
  'rejections',
]);
const QUEUE_REJECTION_KEYS = Object.freeze(['issueNumber', 'category', 'reasons']);
const QUEUE_REJECTION_CATEGORIES = Object.freeze(['malformed', 'risk-gated', 'dependency-blocked', 'rejected']);
const PR_KEYS = Object.freeze(['number', 'title', 'url', 'isDraft', 'reviewDecision', 'mergeableState', 'createdIso', 'updatedIso']);
const CI_KEYS = Object.freeze(['status', 'latestRunIso', 'latestRunUrl', 'recentFailureCount']);
const HANDOFF_KEYS = Object.freeze(['stalled', 'reason']);

const DEPLOYMENT_DATA_KEYS = Object.freeze(['status', 'lastHealthyShaShort', 'lastDeployIso', 'ageMinutes', 'pagesUrl']);

const FEED_EVENT_KEYS = Object.freeze(['key', 'timestampIso', 'type', 'summary', 'url']);

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
  for (const key of allowedKeys) {
    if (!(key in obj)) errors.push(`${label} is missing required field "${key}"`);
  }
}

function checkNullableClosedShape(obj, allowedKeys, label, errors) {
  if (obj === null) return;
  checkClosedShape(obj, allowedKeys, label, errors);
}

function validateWiredSource(source, name, errors) {
  checkClosedShape(source, SOURCE_KEYS, `sources.${name}`, errors);
  if (!isPlainObject(source)) return;
  if (source.wired !== true) errors.push(`sources.${name}.wired must be true for a wired source`);
  if (!SOURCE_STATES.includes(source.state)) {
    errors.push(`sources.${name}.state "${source.state}" must be one of ${SOURCE_STATES.join(', ')}`);
  }
  if (source.lastUpdatedIso !== null && (!isNonEmptyString(source.lastUpdatedIso) || Number.isNaN(Date.parse(source.lastUpdatedIso)))) {
    errors.push(`sources.${name}.lastUpdatedIso must be a valid ISO timestamp or null`);
  }
  if (typeof source.fetchOk !== 'boolean') errors.push(`sources.${name}.fetchOk must be a boolean`);
  if (source.note !== null && !isNonEmptyString(source.note)) {
    errors.push(`sources.${name}.note must be a string or null`);
  }

  if (name === 'engineering' && source.data !== null) {
    checkClosedShape(source.data, ENGINEERING_DATA_KEYS, `sources.engineering.data`, errors);
    if (isPlainObject(source.data)) {
      if (!AUTOMATION_STATES.includes(source.data.automationState)) {
        errors.push(`sources.engineering.data.automationState "${source.data.automationState}" must be one of ${AUTOMATION_STATES.join(', ')}`);
      }
      checkNullableClosedShape(source.data.activeIssue, ACTIVE_ISSUE_KEYS, 'sources.engineering.data.activeIssue', errors);
      checkClosedShape(source.data.queue, QUEUE_KEYS, 'sources.engineering.data.queue', errors);
      if (isPlainObject(source.data.queue)) {
        if (source.data.queue.stalledSinceIso !== null
          && (!isNonEmptyString(source.data.queue.stalledSinceIso) || Number.isNaN(Date.parse(source.data.queue.stalledSinceIso)))) {
          errors.push('sources.engineering.data.queue.stalledSinceIso must be a valid ISO timestamp or null');
        }
        for (const key of ['depth', 'readyCount', 'labeledReadyCount', 'eligibleReadyCount', 'malformedCount', 'riskGatedCount', 'dependencyBlockedCount', 'blockedCount']) {
          if (!Number.isInteger(source.data.queue[key]) || source.data.queue[key] < 0) {
            errors.push(`sources.engineering.data.queue.${key} must be a non-negative integer`);
          }
        }
        if (!Array.isArray(source.data.queue.rejections)) {
          errors.push('sources.engineering.data.queue.rejections must be an array');
        } else {
          source.data.queue.rejections.forEach((rejection, index) => {
            const label = `sources.engineering.data.queue.rejections[${index}]`;
            checkClosedShape(rejection, QUEUE_REJECTION_KEYS, label, errors);
            if (!isPlainObject(rejection)) return;
            if (!Number.isInteger(rejection.issueNumber) || rejection.issueNumber <= 0) {
              errors.push(`${label}.issueNumber must be a positive integer`);
            }
            if (!QUEUE_REJECTION_CATEGORIES.includes(rejection.category)) {
              errors.push(`${label}.category must be one of ${QUEUE_REJECTION_CATEGORIES.join(', ')}`);
            }
            if (!Array.isArray(rejection.reasons) || rejection.reasons.length === 0 || rejection.reasons.some((reason) => !isNonEmptyString(reason))) {
              errors.push(`${label}.reasons must be a non-empty array of strings`);
            }
          });
        }
      }
      checkNullableClosedShape(source.data.pr, PR_KEYS, 'sources.engineering.data.pr', errors);
      checkClosedShape(source.data.ci, CI_KEYS, 'sources.engineering.data.ci', errors);
      if (isPlainObject(source.data.ci) && !CI_STATUSES.includes(source.data.ci.status)) {
        errors.push(`sources.engineering.data.ci.status "${source.data.ci.status}" must be one of ${CI_STATUSES.join(', ')}`);
      }
      checkClosedShape(source.data.handoff, HANDOFF_KEYS, 'sources.engineering.data.handoff', errors);
    }
  }

  if (name === 'deployment' && source.data !== null) {
    checkClosedShape(source.data, DEPLOYMENT_DATA_KEYS, `sources.deployment.data`, errors);
    if (isPlainObject(source.data) && !DEPLOYMENT_STATUSES.includes(source.data.status)) {
      errors.push(`sources.deployment.data.status "${source.data.status}" must be one of ${DEPLOYMENT_STATUSES.join(', ')}`);
    }
  }
}

function validateNotWiredSource(source, name, errors) {
  checkClosedShape(source, SOURCE_KEYS, `sources.${name}`, errors);
  if (!isPlainObject(source)) return;
  if (source.wired !== false) errors.push(`sources.${name}.wired must be false for a not-wired source`);
  if (source.state !== NOT_WIRED_STATE) errors.push(`sources.${name}.state must be "${NOT_WIRED_STATE}" for a not-wired source`);
  if (source.lastUpdatedIso !== null) errors.push(`sources.${name}.lastUpdatedIso must be null for a not-wired source`);
  if (source.fetchOk !== false) errors.push(`sources.${name}.fetchOk must be false for a not-wired source`);
  if (source.data !== null) errors.push(`sources.${name}.data must be null for a not-wired source`);
  if (!isNonEmptyString(source.note)) errors.push(`sources.${name}.note must be a non-empty string explaining why it isn't wired yet`);
}

/**
 * Full structural validation of one `ops/live-feed.json` document. Mirrors
 * scripts/ops-status-schema.mjs's closed-shape approach: every problem is
 * collected, not just the first, so a caller can log a complete picture.
 */
export function validateLiveFeedShape(doc) {
  const errors = [];
  if (!isPlainObject(doc)) return { valid: false, errors: ['live feed document is not an object'] };

  checkClosedShape(doc, TOP_LEVEL_KEYS, 'liveFeed', errors);

  if (doc.schemaVersion !== LIVE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${LIVE_SCHEMA_VERSION}, got ${JSON.stringify(doc.schemaVersion)}`);
  }
  if (!isNonEmptyString(doc.generatedAtIso) || Number.isNaN(Date.parse(doc.generatedAtIso))) {
    errors.push('generatedAtIso must be a valid ISO timestamp string');
  }
  if (!OVERALL_STATES.includes(doc.overallState)) {
    errors.push(`overallState "${doc.overallState}" must be one of ${OVERALL_STATES.join(', ')}`);
  }

  checkClosedShape(doc.ceo, CEO_KEYS, 'ceo', errors);
  if (isPlainObject(doc.ceo)) {
    if (!isNonEmptyString(doc.ceo.headline)) errors.push('ceo.headline must be a non-empty string');
    if (doc.ceo.requiredAction !== null && !isNonEmptyString(doc.ceo.requiredAction)) {
      errors.push('ceo.requiredAction must be a string or null');
    }
    if (doc.ceo.activeWorkSummary !== null && !isNonEmptyString(doc.ceo.activeWorkSummary)) {
      errors.push('ceo.activeWorkSummary must be a string or null');
    }
  }

  if (!isPlainObject(doc.sources)) {
    errors.push('sources must be an object');
  } else {
    for (const key of Object.keys(doc.sources)) {
      if (!SOURCE_NAMES.includes(key)) errors.push(`sources has unexpected key "${key}"`);
    }
    for (const name of SOURCE_NAMES) {
      const source = doc.sources[name];
      if (source === undefined) {
        errors.push(`sources is missing required field "${name}"`);
        continue;
      }
      if (CRITICAL_SOURCE_NAMES.includes(name) || (isPlainObject(source) && source.wired === true)) {
        validateWiredSource(source, name, errors);
      } else {
        validateNotWiredSource(source, name, errors);
      }
    }
  }

  if (!Array.isArray(doc.automationFeed)) {
    errors.push('automationFeed must be an array');
  } else {
    if (doc.automationFeed.length > MAX_AUTOMATION_FEED_EVENTS) {
      errors.push(`automationFeed must not exceed ${MAX_AUTOMATION_FEED_EVENTS} events, got ${doc.automationFeed.length}`);
    }
    doc.automationFeed.forEach((e, i) => {
      checkClosedShape(e, FEED_EVENT_KEYS, `automationFeed[${i}]`, errors);
      if (isPlainObject(e)) {
        if (!isNonEmptyString(e.key)) errors.push(`automationFeed[${i}].key must be a non-empty string`);
        if (!isNonEmptyString(e.timestampIso) || Number.isNaN(Date.parse(e.timestampIso))) {
          errors.push(`automationFeed[${i}].timestampIso must be a valid ISO timestamp`);
        }
        if (!isNonEmptyString(e.type)) errors.push(`automationFeed[${i}].type must be a non-empty string`);
        if (!isNonEmptyString(e.summary)) errors.push(`automationFeed[${i}].summary must be a non-empty string`);
        if (e.url !== null && !isNonEmptyString(e.url)) errors.push(`automationFeed[${i}].url must be a string or null`);
      }
    });
    const seenKeys = new Set();
    doc.automationFeed.forEach((e) => {
      if (isPlainObject(e) && isNonEmptyString(e.key)) {
        if (seenKeys.has(e.key)) errors.push(`automationFeed has a duplicate key "${e.key}"`);
        seenKeys.add(e.key);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Is `lastUpdatedIso` old enough that a source should report `delayed` or
 * `offline` rather than `live`? Pure function of the two timestamps plus
 * this source's own thresholds — see DEFAULT_THRESHOLDS above for why these
 * are per-source rather than one global staleness window like v1's.
 */
export function computeSourceState(lastUpdatedIso, { now, staleAfterMinutes, offlineAfterMinutes }) {
  if (!isNonEmptyString(lastUpdatedIso)) return 'offline';
  const nowMs = new Date(now).getTime();
  const updatedMs = new Date(lastUpdatedIso).getTime();
  if (Number.isNaN(nowMs) || Number.isNaN(updatedMs)) return 'offline';
  const minutesSinceUpdate = Math.max(0, (nowMs - updatedMs) / 60000);
  if (minutesSinceUpdate > offlineAfterMinutes) return 'offline';
  if (minutesSinceUpdate > staleAfterMinutes) return 'delayed';
  return 'live';
}
