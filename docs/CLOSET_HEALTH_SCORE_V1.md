# Closet Health Score v1

Status: fixture-only, deterministic, read-only.

## Purpose

Closet Health explains how well confirmed owned items function as a wardrobe
system. It rewards balance, versatility, rotation, repair, and rediscovery. It
does not reward spending or closet size.

## Components

The versioned score uses explicit weights:

- role balance: 30%;
- versatility: 30%;
- redundancy health: 20%; and
- wear utilization: 20%, only when explicit minimized Wear DNA evidence exists.

Missing wear evidence removes that component from the weighted calculation and
lowers confidence; it is never treated as poor utilization. The result includes
evidence coverage and high, medium, or low confidence.

## Evidence rules

Only exact confirmed wardrobe items and the allowlisted minimized lifecycle
record may be used. The service never invents wear events, prices, condition,
fit, value, gaps, or product identity. Unresolved items and absent wear records
stay explicit.

A confirmed role gap comes from canonical category evidence. Redundancy names
the exact owned references sharing a category and colorway. Forgotten,
never-worn, and repair-needed actions require explicit lifecycle evidence.

## Owned-first actions

Priorities are:

1. repair an owned item;
2. rediscover a forgotten item;
3. style a never-worn item;
4. rotate similar owned pieces;
5. review a confirmed role gap;
6. add missing wear evidence; and
7. correct unresolved items.

There is no default buy action. Affiliate status, commission, current/resale
value, and popularity are not inputs.

## Minimized output

The result contains the version, score, confidence, evidence coverage,
decomposed components, owned item references supporting findings, missing roles,
and owned-first actions. It excludes exact prices, dates, notes, occasions, raw
lifecycle ledgers, affiliate fields, and sensitive profile data.

No network, real account, production storage, analytics, background tracking,
purchase action, or publication is introduced.
