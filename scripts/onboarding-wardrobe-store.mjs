import { products as canonicalProducts } from '../data/products.js';
import {
  createFixturePersonalizationContext,
  evaluatePersonalizationRequest,
  PERSONALIZATION_REQUEST_VERSION,
} from './personalization-api-contract.mjs';
import { SCORING_VERSION } from './personalization-engine.mjs';
import {
  CONSENT_PURPOSES,
  PRIVATE_EXPORT_VERSION,
  WARDROBE_SNAPSHOT_MAX_AGE_DAYS,
} from './private-profile-service-contract.mjs';
import {
  classifyCanonicalProducts,
  correctCaptureCandidate,
  createCaptureCandidate,
} from './wardrobe-capture-normalizer.mjs';

export const ONBOARDING_WARDROBE_VERSION = 'onboarding-wardrobe-v1';
export const ONBOARDING_STORAGE_KEY = 'wearwyzer.onboarding-wardrobe.v1';
export const MINIMUM_WARDROBE_ITEMS = 5;
export const REQUIRED_EVALUATION_CONSENTS = Object.freeze([
  'personalization',
  'style-learning',
  'fit-guidance',
]);
const ACCOUNT_ID = 'fixture-onboarding-account-01';
const CANDIDATE_ID = 'adidas-samba-og-b75806';

function clone(value) {
  return structuredClone(value);
}

function list(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  return String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function fixtureState(nowIso) {
  return {
    schemaVersion: ONBOARDING_WARDROBE_VERSION,
    fixtureOnly: true,
    account: { accountId: ACCOUNT_ID, status: 'active' },
    consents: CONSENT_PURPOSES.map((purpose) => ({
      purpose,
      status: 'not-granted',
      updatedAtIso: nowIso,
    })),
    profile: null,
    fitProfile: null,
    wardrobeSnapshot: {
      wardrobeSnapshotId: 'fixture-onboarding-wardrobe-v1',
      version: 1,
      items: [],
      createdAtIso: nowIso,
    },
    captureIntake: {
      version: 1,
      activeCandidateId: null,
      records: [],
    },
    deletion: null,
    updatedAtIso: nowIso,
  };
}

function hydrateState(state) {
  if (!state.captureIntake) {
    state.captureIntake = {
      version: 1,
      activeCandidateId: null,
      records: [],
    };
  }
  return state;
}

function profileCompleteness(state) {
  const profile = state.profile;
  const fit = state.fitProfile;
  const checks = {
    preferredBrands: Boolean(profile?.favoriteBrands?.length),
    preferredColors: Boolean(profile?.preferredColors?.length),
    preferredAesthetics: Boolean(profile?.preferredAesthetics?.length),
    lifestyle: Boolean(profile?.commonOccasions?.length),
    budget: Boolean(profile?.categoryBudgets && Object.values(profile.categoryBudgets).some(Number.isFinite)),
    fitPreferences: Boolean(fit?.fitPreferences && Object.values(fit.fitPreferences).every(Boolean)),
    sizes: Boolean(fit?.categorySizes && Object.values(fit.categorySizes).every(Boolean)),
  };
  const complete = Object.values(checks).filter(Boolean).length;
  return {
    complete,
    total: Object.keys(checks).length,
    percent: Math.round((complete / Object.keys(checks).length) * 100),
    missing: Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key),
  };
}

function consentStatus(state, purpose) {
  return state.consents.find((entry) => entry.purpose === purpose)?.status ?? 'not-granted';
}

function snapshotView(state, nowIso) {
  const ageDays = (
    new Date(nowIso).getTime() - new Date(state.wardrobeSnapshot.createdAtIso).getTime()
  ) / 86_400_000;
  return {
    ...clone(state),
    completeness: profileCompleteness(state),
    wardrobeSnapshot: {
      ...clone(state.wardrobeSnapshot),
      ageDays,
      maxAgeDays: WARDROBE_SNAPSHOT_MAX_AGE_DAYS,
      stale: ageDays > WARDROBE_SNAPSHOT_MAX_AGE_DAYS,
    },
  };
}

function publicProfile(state) {
  return {
    id: state.profile.profileId,
    audience: 'menswear',
    commonOccasions: [...state.profile.commonOccasions],
    favoriteBrands: [...state.profile.favoriteBrands],
    avoidedBrands: [],
    preferredColors: [...state.profile.preferredColors],
    preferredAesthetics: [...state.profile.preferredAesthetics],
    categoryBudgets: { ...state.profile.categoryBudgets },
    fitPreferences: { ...state.fitProfile.fitPreferences },
  };
}

export function createOnboardingWardrobeStore(
  storage,
  {
    now = () => new Date().toISOString(),
    products = canonicalProducts,
    evaluate = evaluatePersonalizationRequest,
  } = {},
) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('A Web Storage-compatible adapter is required.');
  }

  function load() {
    const raw = storage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return fixtureState(now());
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.schemaVersion !== ONBOARDING_WARDROBE_VERSION || parsed?.fixtureOnly !== true) {
        return fixtureState(now());
      }
      return hydrateState(parsed);
    } catch {
      return fixtureState(now());
    }
  }

  function persist(state) {
    state.updatedAtIso = now();
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function requireActive(state) {
    return state.account?.status === 'active' ? null : { ok: false, error: 'account-not-active' };
  }

  function requireConsent(state, purpose) {
    return consentStatus(state, purpose) === 'granted'
      ? null
      : { ok: false, error: `${purpose}-consent-required` };
  }

  function searchProducts(query) {
    return classifyCanonicalProducts(products, query);
  }

  function addCanonicalProduct(state, product, { provenance, captureId = null, fields = [] }) {
    if (state.wardrobeSnapshot.items.some((item) => item.productId === product.id)) {
      return { ok: false, error: 'duplicate-wardrobe-item' };
    }
    const nowIso = now();
    state.wardrobeSnapshot.version += 1;
    state.wardrobeSnapshot.wardrobeSnapshotId =
      `fixture-onboarding-wardrobe-v${state.wardrobeSnapshot.version}`;
    state.wardrobeSnapshot.createdAtIso = nowIso;
    state.wardrobeSnapshot.items.push({
      id: `owned-${product.id}`,
      productId: product.id,
      wearCount: 0,
      matchState: 'exact',
      matchConfidence: 1,
      provenance,
      captureId,
      confirmedFields: clone(fields),
      createdAtIso: nowIso,
    });
    return { ok: true, wardrobeSnapshot: clone(state.wardrobeSnapshot) };
  }

  return Object.freeze({
    getSnapshot() {
      return snapshotView(load(), now());
    },

    setConsent(purpose, status) {
      if (!CONSENT_PURPOSES.includes(purpose)) return { ok: false, error: 'unsupported-consent-purpose' };
      if (!['granted', 'revoked'].includes(status)) return { ok: false, error: 'unsupported-consent-status' };
      const state = load();
      const denied = requireActive(state);
      if (denied) return denied;
      const record = state.consents.find((entry) => entry.purpose === purpose);
      record.status = status;
      record.updatedAtIso = now();
      persist(state);
      return { ok: true, consent: clone(record) };
    },

    saveProfile(input) {
      const state = load();
      const denied = requireActive(state)
        || requireConsent(state, 'style-learning')
        || requireConsent(state, 'fit-guidance');
      if (denied) return denied;
      const nowIso = now();
      const favoriteBrands = list(input.favoriteBrands);
      const preferredColors = list(input.preferredColors);
      const preferredAesthetics = list(input.preferredAesthetics);
      const commonOccasions = list(input.commonOccasions);
      const categoryBudgets = {
        footwear: Number(input.footwearBudget),
        pants: Number(input.pantsBudget),
        tops: Number(input.topsBudget),
      };
      const fitPreferences = {
        top: String(input.topFit ?? '').trim(),
        bottom: String(input.bottomFit ?? '').trim(),
        footwear: String(input.footwearFit ?? '').trim(),
      };
      const categorySizes = {
        footwear: String(input.footwearSize ?? '').trim(),
        tops: String(input.topSize ?? '').trim(),
        pants: String(input.pantsSize ?? '').trim(),
      };
      state.profile = {
        profileId: `fixture-onboarding-profile-v${(state.profile?.version ?? 0) + 1}`,
        version: (state.profile?.version ?? 0) + 1,
        audience: 'menswear',
        favoriteBrands,
        preferredColors,
        preferredAesthetics,
        commonOccasions,
        categoryBudgets,
        signals: [
          ...favoriteBrands.map((value) => ({ key: 'preferred-brand', value, provenance: 'explicit', confidence: 1 })),
          ...preferredColors.map((value) => ({ key: 'preferred-color', value, provenance: 'explicit', confidence: 1 })),
          ...preferredAesthetics.map((value) => ({ key: 'preferred-aesthetic', value, provenance: 'explicit', confidence: 1 })),
        ].map((signal) => ({ ...signal, updatedAtIso: nowIso })),
        updatedAtIso: nowIso,
      };
      state.fitProfile = {
        fitProfileId: `fixture-onboarding-fit-v${state.profile.version}`,
        version: state.profile.version,
        fitPreferences,
        categorySizes,
        observations: Object.entries(fitPreferences).map(([category, value]) => ({
          category,
          value,
          provenance: 'explicit',
          confidence: 1,
          updatedAtIso: nowIso,
        })),
        updatedAtIso: nowIso,
      };
      persist(state);
      return { ok: true, profile: clone(state.profile), fitProfile: clone(state.fitProfile) };
    },

    searchProducts,

    beginCapture(input) {
      const state = load();
      const denied = requireActive(state) || requireConsent(state, 'personalization');
      if (denied) return denied;
      const sequence = state.captureIntake.version + 1;
      const result = createCaptureCandidate({
        ...input,
        sequence,
        nowIso: now(),
        products,
      });
      if (!result.ok) return result;
      state.captureIntake.version = sequence;
      state.captureIntake.activeCandidateId = result.candidate.candidateId;
      state.captureIntake.records.push(result.candidate);
      persist(state);
      return { ok: true, candidate: clone(result.candidate) };
    },

    correctCapture(candidateId, correction) {
      const state = load();
      const denied = requireActive(state) || requireConsent(state, 'personalization');
      if (denied) return denied;
      const index = state.captureIntake.records.findIndex((entry) => entry.candidateId === candidateId);
      if (index < 0 || state.captureIntake.activeCandidateId !== candidateId) {
        return { ok: false, error: 'capture-not-reviewable' };
      }
      const result = correctCaptureCandidate(
        state.captureIntake.records[index],
        correction,
        products,
        now(),
      );
      if (!result.ok) return result;
      state.captureIntake.records[index] = result.candidate;
      persist(state);
      return { ok: true, candidate: clone(result.candidate), correction: clone(result.correction) };
    },

    rejectCapture(candidateId) {
      const state = load();
      const denied = requireActive(state) || requireConsent(state, 'personalization');
      if (denied) return denied;
      const candidate = state.captureIntake.records.find((entry) => entry.candidateId === candidateId);
      if (!candidate || state.captureIntake.activeCandidateId !== candidateId) {
        return { ok: false, error: 'capture-not-reviewable' };
      }
      candidate.status = 'rejected';
      candidate.updatedAtIso = now();
      state.captureIntake.activeCandidateId = null;
      persist(state);
      return { ok: true, candidate: clone(candidate) };
    },

    confirmCapture(candidateId) {
      const state = load();
      const denied = requireActive(state) || requireConsent(state, 'personalization');
      if (denied) return denied;
      const candidate = state.captureIntake.records.find((entry) => entry.candidateId === candidateId);
      if (!candidate || state.captureIntake.activeCandidateId !== candidateId) {
        return { ok: false, error: 'capture-not-reviewable' };
      }
      if (candidate.match.state !== 'exact' || !candidate.match.productId) {
        return { ok: false, error: 'explicit-exact-correction-required' };
      }
      const product = products.find((entry) => entry.id === candidate.match.productId);
      if (!product || product.matchType !== 'Exact item') {
        return { ok: false, error: 'exact-product-required' };
      }
      const added = addCanonicalProduct(state, product, {
        provenance: `confirmed-${candidate.source}`,
        captureId: candidate.candidateId,
        fields: candidate.fields,
      });
      if (!added.ok) return added;
      candidate.status = 'confirmed';
      candidate.confirmedAtIso = now();
      candidate.updatedAtIso = candidate.confirmedAtIso;
      state.captureIntake.activeCandidateId = null;
      persist(state);
      return {
        ok: true,
        candidate: clone(candidate),
        wardrobeSnapshot: clone(state.wardrobeSnapshot),
      };
    },

    addProduct(productId) {
      const state = load();
      const denied = requireActive(state) || requireConsent(state, 'personalization');
      if (denied) return denied;
      const product = products.find((entry) => entry.id === productId);
      if (!product) return { ok: false, error: 'unknown-product-match' };
      const result = searchProducts(product.name).find((entry) => entry.productId === productId);
      if (!result || result.matchState === 'ambiguous') return { ok: false, error: 'ambiguous-product-match' };
      if (result.matchState !== 'exact') return { ok: false, error: 'exact-product-required' };
      const added = addCanonicalProduct(state, product, { provenance: 'canonical-search' });
      if (!added.ok) return added;
      persist(state);
      return { ok: true, wardrobeSnapshot: clone(state.wardrobeSnapshot) };
    },

    removeProduct(productId) {
      const state = load();
      const denied = requireActive(state) || requireConsent(state, 'personalization');
      if (denied) return denied;
      const before = state.wardrobeSnapshot.items.length;
      state.wardrobeSnapshot.items = state.wardrobeSnapshot.items.filter((item) => item.productId !== productId);
      if (state.wardrobeSnapshot.items.length === before) return { ok: false, error: 'wardrobe-item-not-found' };
      state.wardrobeSnapshot.version += 1;
      state.wardrobeSnapshot.wardrobeSnapshotId =
        `fixture-onboarding-wardrobe-v${state.wardrobeSnapshot.version}`;
      state.wardrobeSnapshot.createdAtIso = now();
      persist(state);
      return { ok: true, wardrobeSnapshot: clone(state.wardrobeSnapshot) };
    },

    evaluateCandidate(candidateId = CANDIDATE_ID) {
      const state = load();
      const denied = requireActive(state);
      if (denied) return denied;
      for (const purpose of REQUIRED_EVALUATION_CONSENTS) {
        const missing = requireConsent(state, purpose);
        if (missing) return missing;
      }
      const completeness = profileCompleteness(state);
      if (completeness.percent < 100) return { ok: false, error: 'incomplete-profile', completeness };
      if (state.wardrobeSnapshot.items.length < MINIMUM_WARDROBE_ITEMS) {
        return { ok: false, error: 'insufficient-wardrobe', minimum: MINIMUM_WARDROBE_ITEMS };
      }
      const ageDays = (
        new Date(now()).getTime() - new Date(state.wardrobeSnapshot.createdAtIso).getTime()
      ) / 86_400_000;
      if (ageDays > WARDROBE_SNAPSHOT_MAX_AGE_DAYS) {
        return { ok: false, error: 'stale-wardrobe-snapshot' };
      }
      const candidate = products.find((product) => product.id === candidateId);
      if (!candidate) return { ok: false, error: 'unknown-product-match' };
      const context = {
        profiles: new Map([[state.profile.profileId, publicProfile(state)]]),
        wardrobeSnapshots: new Map([[
          state.wardrobeSnapshot.wardrobeSnapshotId,
          { id: state.wardrobeSnapshot.wardrobeSnapshotId, items: clone(state.wardrobeSnapshot.items) },
        ]]),
      };
      const defaultContext = createFixturePersonalizationContext();
      Object.assign(context, {
        catalog: defaultContext.catalog,
        offers: defaultContext.offers,
        facts: defaultContext.facts,
      });
      const request = {
        schemaVersion: PERSONALIZATION_REQUEST_VERSION,
        requestId: `fixture-onboarding-request-${state.wardrobeSnapshot.version}`,
        scoringVersion: SCORING_VERSION,
        subject: {
          profileId: state.profile.profileId,
          wardrobeSnapshotId: state.wardrobeSnapshot.wardrobeSnapshotId,
        },
        candidate: {
          productId: candidateId,
          matchState: 'exact',
          matchConfidence: 1,
        },
        consent: { personalization: true },
        requestedAtIso: now(),
      };
      const response = evaluate(request, context, { nowIso: now() });
      if (response.status !== 'ok') return { ok: false, error: response.error, response };
      return { ok: true, request: clone(request), response: clone(response) };
    },

    exportJson() {
      const state = load();
      return JSON.stringify({
        schemaVersion: PRIVATE_EXPORT_VERSION,
        fixtureOnly: true,
        account: clone(state.account),
        consents: clone(state.consents),
        profile: clone(state.profile),
        fitProfile: clone(state.fitProfile),
        wardrobeSnapshot: clone(state.wardrobeSnapshot),
        captureIntake: clone(state.captureIntake),
        deletion: clone(state.deletion),
        exportedAtIso: now(),
      }, null, 2);
    },

    requestDeletion() {
      const state = load();
      const denied = requireActive(state);
      if (denied) return denied;
      state.account.status = 'deleting';
      state.deletion = {
        state: 'pending',
        requestedAtIso: now(),
        completedAtIso: null,
      };
      persist(state);
      return { ok: true, deletion: clone(state.deletion) };
    },

    completeDeletion() {
      const state = load();
      if (state.deletion?.state !== 'pending') return { ok: false, error: 'pending-deletion-not-found' };
      const completedAtIso = now();
      const deleted = fixtureState(completedAtIso);
      deleted.account.status = 'deleted';
      deleted.account.accountId = 'deleted';
      deleted.consents = deleted.consents.map((entry) => ({ ...entry, status: 'not-granted' }));
      deleted.profile = null;
      deleted.fitProfile = null;
      deleted.wardrobeSnapshot.items = [];
      deleted.deletion = {
        state: 'completed',
        requestedAtIso: state.deletion.requestedAtIso,
        completedAtIso,
      };
      persist(deleted);
      return { ok: true, deletion: clone(deleted.deletion) };
    },

    reset() {
      storage.removeItem(ONBOARDING_STORAGE_KEY);
      return snapshotView(fixtureState(now()), now());
    },
  });
}
