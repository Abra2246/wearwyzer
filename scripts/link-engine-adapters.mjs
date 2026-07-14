// Verified supporting-item link engine v1 (issue #24) — provider-agnostic
// adapter layer. No I/O in this file; every adapter this module builds is
// either a deterministic in-memory fixture (search/verify against a fixed
// listings table, always available, no network) or an inert HTTP-provider
// stub that always reports "blocked: missing credential" (this repository
// ships no live retailer/affiliate-network credential — see CLAUDE.md and
// docs/LINK_ENGINE_V1.md), mirroring the same
// inert-until-configured pattern scripts/openai-image-provider.mjs and
// scripts/guide-renderer-adapter.mjs already use for the same reason.
//
// Canonical spec: docs/LINK_ENGINE_V1.md
//
// Adapter contract (every adapter, fixture or real, implements exactly
// this shape so scripts/link-engine.mjs never hard-codes a provider):
//   {
//     id: string,
//     kind: 'brand-site' | 'retailer' | 'affiliate-network' | 'product-feed',
//     name: string,
//     mode: 'fixture' | 'http-provider',
//     async search(query): candidate[] | { blocked, errorType, reason },
//     async verify(listingId): candidate | null | { blocked, errorType, reason },
//   }
// A candidate/listing record:
//   {
//     listingId, adapterId, brand, name, title, category, color, material,
//     gender, canonicalId, image, retailerName,
//     canonicalUrl, retailerUrl, affiliateUrl,   // never one field standing in for another
//     price, currency, httpStatus, redirectTo,
//     stock: 'in_stock' | 'out_of_stock' | 'unknown',
//     affiliateEligible: boolean,
//     priceTier: 'budget' | 'mid' | 'premium' | null,
//   }

export const ADAPTER_KINDS = Object.freeze(['brand-site', 'retailer', 'affiliate-network', 'product-feed']);

function assertKind(kind) {
  if (!ADAPTER_KINDS.includes(kind)) {
    throw new Error(`unknown adapter kind "${kind}" — must be one of ${ADAPTER_KINDS.join(', ')}`);
  }
}

/**
 * A deterministic, network-free adapter backed by a fixed in-memory
 * listings table. This is the only adapter mode this repository actually
 * exercises with real data flow — every test and simulation in this v1
 * uses fixture adapters exclusively, per the issue's "deterministic
 * fixtures first so no live affiliate credentials are required" scope.
 */
export function createFixtureAdapter({ id, kind, name, listings = [] }) {
  assertKind(kind);
  const byId = new Map(listings.map((listing) => [listing.listingId, listing]));

  return Object.freeze({
    id,
    kind,
    name,
    mode: 'fixture',
    async search(query = {}) {
      return listings
        .filter((listing) => !query.category || listing.category === query.category)
        .map((listing) => ({ ...listing, adapterId: id }));
    },
    async verify(listingId) {
      const listing = byId.get(listingId);
      return listing ? { ...listing, adapterId: id } : null;
    },
  });
}

/** Reads a per-adapter credential from the environment, never from argv/an issue body/a file — same sourcing rule as scripts/openai-image-provider.mjs's readApiKeyFromEnv(). */
export function readAdapterCredentialFromEnv(adapterId, env = process.env) {
  const key = env[`LINK_ENGINE_CREDENTIAL_${String(adapterId).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`];
  return typeof key === 'string' && key.trim().length > 0 ? key : null;
}

/**
 * The extension point a future real brand/retailer/affiliate-network
 * integration would implement. Permanently inert in this repository: with
 * no credential configured (the only state this environment can ever be
 * in — no secret is committed here), every call fails closed with a
 * structured `blocked` result, never throws, never fabricates a listing.
 * `fetchImpl` is accepted (unused while blocked) purely so a real
 * implementation can inject a transport for tests the same way
 * scripts/openai-image-provider.mjs does.
 */
export function createHttpProviderAdapter({ id, kind, name, env = process.env, fetchImpl = fetch }) {
  assertKind(kind);
  const credential = readAdapterCredentialFromEnv(id, env);

  function blocked() {
    return {
      blocked: true,
      errorType: credential ? 'not_implemented' : 'missing_credential',
      reason: credential
        ? `${id}: no live provider integration is implemented in this repository (fixture adapters only in v1)`
        : `${id}: no credential configured (LINK_ENGINE_CREDENTIAL_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')} is unset) — this repository ships no live affiliate/retailer credentials`,
    };
  }

  return Object.freeze({
    id,
    kind,
    name,
    mode: 'http-provider',
    isConfigured: Boolean(credential),
    async search() {
      return blocked();
    },
    async verify() {
      return blocked();
    },
    _fetchImpl: fetchImpl,
  });
}

/** True only for adapters that can actually return data right now — lets the pipeline skip inert stubs without special-casing "mode". */
export function isAdapterUsable(adapter) {
  return Boolean(adapter) && (adapter.mode === 'fixture' || (adapter.mode === 'http-provider' && adapter.isConfigured));
}
