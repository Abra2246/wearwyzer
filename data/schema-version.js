// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — schema version marker.
//
// See docs/KNOWLEDGE_GRAPH_V1.md for what this schema covers and
// docs/KNOWLEDGE_GRAPH_MIGRATION.md for how it's expected to change.
//
// This is issue #12's "additive foundation" cut: entity shapes and
// relationship modeling only, with data mapped 1:1 from the existing
// js/products.js and js/guides.js. It intentionally does not yet cover
// closets, wishlists, or AI-generated recommendations (see ROADMAP.md —
// those are downstream milestones this graph does not unblock on its
// own).
// ============================================================

export const SCHEMA_NAME = 'wearwyzer-knowledge-graph';

// Semver of the *schema shape*, not of the data inside it. Bump the
// minor version when an entity gains an optional field; bump the major
// version when a field is renamed/removed or a relationship predicate's
// meaning changes in a way that breaks existing consumers.
export const SCHEMA_VERSION = '1.0.0';

// Source-of-truth boundary for this version (see "Source-of-truth
// boundaries" in docs/KNOWLEDGE_GRAPH_V1.md): js/products.js and
// js/guides.js remain canonical. Every data/*.js module in this
// directory is a derived, read-only projection computed from them at
// import time — nothing under data/ is hand-authored content.
export const SOURCE_OF_TRUTH = Object.freeze({
  products: 'js/products.js',
  guides: 'js/guides.js',
  siteSettings: 'js/site-data.js',
});

export const schemaVersion = Object.freeze({
  name: SCHEMA_NAME,
  version: SCHEMA_VERSION,
  sourceOfTruth: SOURCE_OF_TRUTH,
});

export default schemaVersion;
