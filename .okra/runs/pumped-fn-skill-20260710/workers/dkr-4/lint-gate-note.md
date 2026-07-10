# DKR-4 — lint-gate integrity + codex model availability

worker: dkr-4 · run: pumped-fn-skill-20260710 · observed: 2026-07-10
Source read at: `pkg/tool/lint/src/cli.ts` (99 lines), `pkg/tool/lint/src/index.ts` (1795 lines).
Dist freshness: `dist/cli.mjs`+`dist/index.mjs` mtime 1783635759 > `src/index.ts` mtime 1783580562 — dist is NEWER than src, and dist/index.mjs contains identical `ambientNamePattern` and the newest rule (`no-handle-spread`). Dist is current; no rebuild needed.

## Q1.1 — Config discovery

**The CLI loads NO config implicitly.** `cli.ts:60-64` (`loadConfig`) only reads a JSON file when `--config <path>` is passed; otherwise `{}`. No cwd lookup, no package.json field, no rc files. Config can only override per-rule `severity` ("error"/"warn"/"off") and allowlists (`allowGlobals`, `allowImplicit`, `allowBuiltins`) — it cannot add rules. Default severities are compiled in (`src/index.ts:78-86`): 7 rules default to warn (no-handle-spread, no-implicit-tag-read, no-naked-globals, no-module-state, prefer-destructured-deps, no-untyped-throw, no-swallowed-error), the other 17 default to error.

**Exit code** (`cli.ts:88-92`): 1 only if any error-severity diagnostic, or warn count > `--max-warnings`. Without `--max-warnings`, warn-tier NEVER fails. The repo root `pnpm lint` (root `package.json:12`) passes no `--config` and no `--max-warnings` — i.e. the repo itself runs defaults with warn-tier non-fatal.

## Q1.2 — Why DKR-2 saw 0 diagnostics for Date.now in an atom factory

`Date.now()` inside an atom factory DOES fire (probe b below: no-ambient-io error + no-naked-globals warn). The false negative comes from the **ambient-name allowance** (`src/index.ts:153, 487-496`): a diagnostic is suppressed when ANY enclosing declaration name matches

```
/(Http|Transport|Clock|Storage|Random|Timer|Poller|Route|Adapter|Boundary|Main|Root|Bootstrap|Wire|Env|Ids?)/i
```

— case-insensitive and **unanchored substring**. `const clock = atom(...)` obviously matches, but so does `const provider = atom(...)` (prov**id**er ⊃ "id" via `Ids?`). Probe c confirms: both `provider` and `clock` handles → 0 diagnostics. Any handle name containing "id", "env", "main", "route", etc. as a substring silently disables no-ambient-io AND no-naked-globals for that whole node. This is the DKR-2 explanation (or its path variant: `isAmbientAllowedPath`, `src/index.ts:202-205`). Second construct hole: `atom(() => Date.now())` (non-object arg) is not a "unit config", so no-naked-globals cannot fire (probe b2 — only no-ambient-io fired).

## Rule scoping table (path / filename / construct sensitivity)

Rules only see @pumped-fn constructs via **import strings** (`src/index.ts:296-396`): creators must be imported from `@pumped-fn/lite`/`@pumped-fn/lite-react` (named or namespace). No module resolution — files lint fine with no node_modules.

| Sensitivity | Rules / mechanics | Source ref |
|---|---|---|
| Skipped entirely | lockfiles; `before.*` files; any path segment in {node_modules, .git, dist, coverage, .next, .turbo} | index.ts:143-152, 179-184 |
| Test path (`tests/`, `__tests__/` segment, or `.test/.spec/.browser/.bench.*` suffix) | DISABLES no-scope-argument, no-scope-reach, no-unattributed-await, ambient/naked-global checks, react-feature rules; ENABLES no-render-outside-browser-test | index.ts:152, 979-982, 1183 |
| Composition filename (`main|bootstrap|wire|adapter|composition|http|transport|server.*`) | allows shared-scope-factory, ambient IO, naked globals, unattributed await; no-scope-argument switches to "exported glue" message | index.ts:150, 979-982, 1619 |
| Dir segment `infra/`, `transport/`, `adapters/` | ambient IO + naked globals allowed | index.ts:204 |
| `.tsx/.jsx` non-test non-composition ("react feature") | enables no-react-use-scope / use-execution-context / local-state / manual-execution-context | index.ts:198-200 |
| `package.json` basename / `vitest.config*` | no-jsdom-backend package/env checks | index.ts:271, 1506 |
| Declaration-name allowance (construct, not path) | ambientNamePattern substring on any enclosing decl name kills no-ambient-io + no-naked-globals | index.ts:153, 487-496 |
| Construct: creator must be called with object-literal config | no-naked-globals, no-untyped-throw, no-swallowed-error, no-implicit-tag-read, prefer-destructured-deps need `atom({factory: ...})` form; `atom(fn)` escapes them | index.ts:576-580 |
| Construct: file must contain ≥1 unit factory | no-module-state only fires when `hasGraphNodes` | index.ts:988, 1667 |
| Path-insensitive | no-module-mocks, no-definition-handle-suffix, no-ctx-argument, no-direct-flow-composition, no-handle-spread, text rules (no-internal-example-label, no-test-only-branches) | — |

## Empirical probe matrix (external files under /tmp scratch; `node pkg/tool/lint/dist/cli.mjs <path>`)

| Probe file | Construct | Fired | Exit |
|---|---|---|---|
| a-flow-naked.ts | `Date.now()` in flow factory | no-ambient-io [error] + no-naked-globals [warn] | 1 |
| b-atom-naked.ts | `Date.now()` in atom factory, handle `stamp` | no-ambient-io [error] + no-naked-globals [warn] | 1 |
| b2-atom-shorthand.ts | `atom(() => Date.now())` (no config object) | no-ambient-io [error] only | 1 |
| c-atom-ambientname.ts | same as b, handles `provider` / `clock` | NOTHING (ambient-name allowance) | 0 |
| d-atom-env.ts | `process.env.PORT` in atom factory | no-naked-globals [warn] only | 0 |
| e-scope-arg.ts | `export function boot(scope: Lite.Scope)` | no-scope-argument [error] | 1 |
| f-module-state.ts | module `let` + atom in file | no-module-state [warn] | 0 |
| g-deps-ident.ts | `(ctx, deps) => deps.base` | prefer-destructured-deps [warn] | 0 |
| adapter.ts | same as b, filename `adapter.ts` | NOTHING (composition path) | 0 |
| tests/b-atom-naked.ts | same as b under `tests/` | NOTHING (test path) | 0 |
| d-atom-env.ts with `--max-warnings 0` | — | same warn | **1** |

Note: `no-ambient-io-outside-boundary` fires on Date.now even OUTSIDE factories — a-flow probe fired it at error tier. process.env is naked-globals-only (warn tier) — an eval run without `--max-warnings 0` exits 0 on it.

## Q1.3 — Recommended eval-workspace invocation for full parity

Full rule parity requires no repo context: all 24 rules, severities, and allowances are compiled into the standalone dist bundle (only dep: `typescript`, bundled check — dist/index.mjs imports `typescript`; it resolves from the lint package's own node_modules when run via the repo path). Invocation:

```
node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --json --max-warnings 0 <workspace-dir>
```

- `--max-warnings 0` is REQUIRED for AG-1 "warn-tier included"; without it (and the repo's own `pnpm lint` omits it) warn diagnostics never affect exit code. This is STRICTER than the repo's own gate — flag for ratification.
- No `--config` = repo-default severities = parity with repo defaults.
- Workspace layout constraints for parity: eval solution files must NOT sit under dir segments `tests/`, `infra/`, `transport/`, `adapters/` and must NOT be named `main|bootstrap|wire|adapter|composition|http|transport|server|before.*` — or several rules silently disable. Handle names containing ambient substrings (incl. "id" anywhere — `provider`, `identity`) suppress ambient/naked-global rules per node.
- Parity gap (unfixable by invocation): the ambient-name substring allowance and the `atom(fn)` shorthand escape mean AG-1 "0 diagnostics" is satisfiable by naming tricks — the lint gate alone cannot distinguish honest compliance from an accidental (or gamed) allowance hit.

## Q2 — codex model availability (2 pings, both exit 0)

| Model | Command | Exit | Response |
|---|---|---|---|
| gpt-5.6-terra | `echo 'Reply with exactly: ok' \| codex exec - -m gpt-5.6-terra -s read-only --skip-git-repo-check --ephemeral -C /tmp` | 0 | `ok` (7,405 tokens) |
| gpt-5.6-sol | same with `-m gpt-5.6-sol` | 0 | `ok` (7,917 tokens) |

Both models available; terra/sol split executable (AG-3 holds as of 2026-07-10 — availability is point-in-time, not guaranteed).

## Replay

```
node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 \
  /tmp/claude-1001/-home-lagz0ne-dev-pumped-fn/5a2e0b1e-a847-48c3-bb8d-c910128ee0e7/scratchpad/dkr4/probe
```
