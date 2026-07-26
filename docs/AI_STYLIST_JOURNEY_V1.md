# Fixture AI Stylist journey v1

## Purpose

This unlinked, `noindex`, default-off route makes the grounded Stylist contract
reviewable as a user experience before any live model or real wardrobe exists.

## Journey

With the exact `ww_stylist=1` flag, a synthetic user can:

- select any of the six supported Stylist intents;
- choose current, stale, or insufficient evidence;
- generate a deterministic grounded answer or honest abstention;
- inspect claim type, citations, evidence type/version/state, uncertainty, and
  opposing evidence;
- reset the fixture and remove prior response state.

The route displays only the minimized Stylist response. It never displays the
private prompt or raw profile and wardrobe facts.

## Safety and privacy

The journey is stateless, provider-free, network-free, and synthetic. It offers
no control to buy, message, post, book, publish, mutate an account, or take any
other external action.

## Production gates

No live model/provider, paid spend, real account/data, production storage,
analytics, calendar/location access, camera/photo workflow, affiliate
credential, Chrome permission, external action, publishing, or likeness
generation is authorized.

## Validation evidence

- Eleven journey tests cover state initialization, all six intents, stale and
  insufficient abstention, response invalidation, reset, unsupported inputs,
  output minimization, the exact default-off flag, absence of external
  actions/network/providers, mobile and focus safeguards, and isolation from
  public navigation.
- The full repository gate passes 600/600 deterministic tests plus the content,
  Knowledge Graph, hero-product, HTML metadata, static-site, and diff-scoped
  validators.
- Browser QA confirmed the disabled and enabled routes, each intent with
  current evidence, both abstention paths, citation and opposing-evidence
  rendering, input-change clearing, reset with focus restoration, visible
  keyboard focus, no horizontal overflow at the available viewport, and no
  console errors.
