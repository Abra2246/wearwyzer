// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — internal helper, shared by the data/
// modules only. Not part of the public schema surface described in
// docs/KNOWLEDGE_GRAPH_V1.md.
// ============================================================

// Deterministic id derivation from a human-readable name, used wherever
// the graph needs a stable id for an entity (brand, retailer, category,
// occasion, outfit) that the legacy js/*.js data only expresses as a
// free-text string. "&" is spelled out rather than dropped so
// "H&M" and "Abercrombie & Fitch" don't collapse two different brands'
// words together.
export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['".]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
