Revised only `skills/pumped-fn/`.

Files changed:

- [SKILL.md](/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/skills/pumped-fn/SKILL.md) — 9,146 bytes
- [primitives.md](/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/skills/pumped-fn/references/primitives.md) — 5,234 bytes
- [testing.md](/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/skills/pumped-fn/references/testing.md) — 3,269 bytes
- [extensions.md](/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/skills/pumped-fn/references/extensions.md) — 2,446 bytes
- [review.md](/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/skills/pumped-fn/references/review.md) — 5,446 bytes
- [worked-example.md](/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/skills/pumped-fn/references/worked-example.md) — 3,580 bytes

REV-1 ranked items:

1. Fixed all reported API defects: required `params`, valid `scope.select`, `next()`, effective execution name, one execution promise in type test, corrected close-order/parent-ownership wording.
2. Moved scored ownership, testing, prepare, bounded drain, traps, and all idiom micro-rules into `SKILL.md`/`review.md`.
3. Added non-invoice application rules/micro-snippets for I-1 through I-32, including the prioritized I-7/8/10/17/26/30/31.
4. Added equality, GC/flush, resource watch, select/set, parent-chain/service pattern, incremental-adoption text. React/Hono are only adjacent-surface pointers, per v1 scope.
5. Split `review.md` into clean `lint:` mappings (all 24, one rule each) and `preference:` review criteria.
6. Reconciled I-17: planned flow errors use `faults` plus `ctx.fail`; named structured error classes are reserved for adapter/library boundaries.

VAL-1 defects:

- Missing `params`: added `params: []` to every zero-argument inline `ctx.exec`.
  Declaration: `index.d.mts:204-205`, `233-237`.
- Unsatisfied logging package: worked example now uses an inline `Lite.Extension`; template dependencies unchanged.
  Declaration: `index.d.mts:458-470`.
- Invalid top-level `select` import: removed it; example uses `scope.select(...)`.
  Declaration: `index.d.mts:28-46`.

Declaration checks by fenced snippet group:

- `primitives.md`: scope/select/GC/drain `28-63`; flow handles/prepare `104-115`; execution/faults/foreign calls `194-237`; controllers/select handles `244-305`; tags/equality `321-330`; atom/controller `757-865`; flow overloads `898-1038`; resources `1174-1185`.
- `testing.md`: flow execution and close `194-232`.
- `extensions.md`: extension wrappers `458-470`; named foreign calls `204-237`.
- `worked-example.md`: atom/controller/flow/resource/createScope and execution lines above; inline extension `458-470`.

Replay run in the supplied template shape: lint with `--max-warnings 0`, `tsgo --noEmit`, and `vitest run` exited 0. Primitive fenced snippets also typechecked against the pinned tarball declarations.

Idioms now taught: I-1 through I-32 each has an entry-level rule plus concrete application criterion or micro-snippet.  
Still thin / unresolved: none recorded; adequacy is left to the deterministic re-gate.

`questions_unanswered`: none.