---
"@pumped-fn/lite": minor
---

New `attribute` and `flag` kinds: declaration-layer membership keys that discriminate
carriers of the same tag. An attribute shares the tag mechanism — label, value,
`eq` — but answers membership, never lookup: `has(carrier, value)` and
`collect(carrier)` read a carrier's binding set. `select: false` marks consumer-owned
attributes that application picking must ignore; `flag({ label })` covers
presence-only markers and never participates in picking.

Attributes bind through creation options, never through values: a tag declaration may
carry default attributes (`tag({ label, attributes })`) materialized into every
tagged, and any tag call may override them per attribute through the new second
options argument — `route({ method, path }, { attributes: [...] })`. The value is
never inspected or copied, so this release is purely additive: every existing
one-argument tag call behaves exactly as before, and value fields named `attributes`
round-trip untouched.

Also exports `normalizeAttributes`; malformed attribute input fails with
"attributes must contain only attributed values and arrays" instead of a misleading
cyclic-array error.
