# Contributing to WearWyzer

## Roles
- **CEO (Abraham)** — product vision, final approval, business priorities.
- **Content CTO** — product architecture, database design, editorial systems, AI strategy, long-term roadmap.
- **Engineering** — implementation. If implementation reveals a flaw in the proposed architecture, document the problem and a proposed alternative in `ARCHITECTURE.md` before proceeding — don't silently diverge from the agreed design.

## Before adding a feature
1. Check `ROADMAP.md` — is this milestone next in sequence, or does it depend on one that hasn't landed yet? Building Closet/Wishlist or the AI Stylist ahead of the database milestones (`ROADMAP.md` Milestone 3) means rebuilding it later — don't.
2. Check `ARCHITECTURE.md` for an existing recommendation covering the area you're touching.
3. Prefer the smallest change that solves the real problem. Don't rewrite working code to a different approach just because one exists — see `ENGINEERING_AUDIT.md` §7 for known debt that's intentionally deferred.

## Content changes (guides, products, prices, affiliate links)
These are not engineering changes — see `DEVELOPMENT.md`. They only touch `js/site-data.js`, `js/guides.js`, `js/products.js`, and never require editing a page's markup.

## Style
- Inline styles only, matching the existing palette (cream `#F6F1E8` / surface `#FFFDF8` / ink `#0B0B0B` / muted `#68645D` / border `#DDD3C3` / accent `#C8941E`) and Oswald display type. Don't introduce new colors or fonts without sign-off.
- No fabricated data: prices, affiliate links, availability, sponsorships, or legal entity details must never be invented. Use the existing placeholder patterns (`Price TBD`, `Link coming soon`, `[LEGAL ENTITY NAME]`).

## Documentation
Every significant architectural decision gets written down in `ARCHITECTURE.md` (with current state / problem / proposed solution / benefit / migration effort / priority) **before** it's implemented, not after. Update `CHANGELOG.md` for every shipped change.
