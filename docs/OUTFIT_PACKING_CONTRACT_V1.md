# Outfit calendar and packing contract v1

## Purpose

WearWyzer should help a person use their wardrobe, not merely catalog it. This
fixture contract defines a trustworthy path from confirmed owned items to an
explainable outfit plan and deduplicated packing list.

## Private request

A versioned request contains explicit:

- profile and wardrobe snapshot references;
- plan dates and occasion categories;
- optional private occasion notes;
- dress codes and climate inputs;
- required clothing categories;
- preferred colors;
- maximum uses per item;
- packing limit, laundry availability, and essential owned items.

The app owns this private request. Exact dates, private notes, and correction
history do not cross the minimized recommendation boundary.

## Planning rules

- Only exact, confirmed canonical wardrobe items are eligible.
- Dirty and unavailable items are excluded.
- Dress-code and climate inputs must match.
- Repeats stay within the explicit item-use limit.
- Selection is deterministic, with stable item IDs breaking equal scores.
- Missing categories become visible gaps and opposing evidence.
- The planner never fabricates an item to complete an outfit.
- Packing items are deduplicated across outfits.
- An extra packing item must be an explicit, eligible owned essential.
- A plan exceeding the explicit packing limit fails with exact evidence.

## Minimized response

The future website, app, AI Stylist, and extension may receive:

- plan and wardrobe snapshot references;
- day indexes rather than exact dates;
- dress-code and climate categories;
- the exact owned item references used;
- reasons and opposing evidence;
- packing item references and justification;
- honest gaps, status, and confidence.

They do not receive exact dates, private occasion notes, profile contents,
measurements, prices, fit notes, location, or private correction/event ledgers.

## Correction, export, and deletion

Explicit corrections create a new immutable request version. Export and
deletion belong to the future private profile service. Deletion invalidates the
request, removes private inputs, and prevents any later plan from being
generated from the deleted state.

## Validation

Ten deterministic tests cover valid plans, request validation, packing
deduplication, dirty/unavailable/unconfirmed exclusion, repeat-limit gaps,
packing limits, correction precedence, privacy minimization, invalidation, and
input immutability. The repository baseline is 568 passing tests plus every
deterministic content, Knowledge Graph, hero-product, metadata, static-site, and
diff validator.

## Production gates

No real account, calendar credential, background location, weather provider,
travel or booking integration, external message, analytics, production
storage, paid call, affiliate credential, camera/photo workflow, or public
release is authorized by this contract.
