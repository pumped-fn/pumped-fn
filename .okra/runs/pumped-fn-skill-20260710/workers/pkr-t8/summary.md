# T-8 summary — severe-weather alert fan-out (Tier C, port multiplicity)

worker pkr-t8 · run pumped-fn-skill-20260710 · linked_ckr CKR-1 · source dkr-5-checkpoint

## What the task examines

Port multiplicity + optional policy + failure isolation: register sec.3 gap 4
(`tags.all` / `tags.optional`), idioms I-5 (port tags bound at roots), I-4 (declared
optionality), I-26 (named foreign edges), I-17 (no swallowed errors), I-2/I-20/I-21
(scope-seam wiring and tests), I-27 (extension-visible edges). Domain: mountain weather
station — disjoint from invoice-triage.

## API findings (source-verified, feed the skill; corrections to dkr-3b T-8 mechanics)

1. `tags.all` in FLOW deps = `collectFromHierarchy` (src/scope.ts:1226): ONE binding per
   context-chain level (context data is a Map keyed by tag.key). `tags.all` in ATOM deps
   = `tag.collect` over the scope's raw tags array (src/scope.ts:1081): EVERY binding.
   Registration multiplicity at one scope therefore requires a registry atom; dkr-3b
   T8-D1's "feature code resolves channels via tags.all" (in the flow) does not work
   against the real library. Probe: flow-direct `["radio"]` vs atom-registry
   `["radio","siren","sms"]`.
2. Flow-valued tags reject in atom deps; a tag carrying an ARRAY of flows type-projects
   (`Lite.Projected`) but fails at runtime (`h.exec is not a function`). Channel port
   carries a plain `{ name, send }` capability spec instead.
3. `ctx.exec({ fn, name })` requires `params` (`Lite.ExecFnOptions`, d.mts:233-238);
   README's snippet omits it and the call throws "params is not iterable". Extensions
   read the edge name via `wrapExec`'s third arg `ctx.name` (probe verified).

## Checker check-list (harness/check-t8.mjs — 12 checks, all side-effect-bearing)

decl-exports · b1 fanout×3 with per-channel call logs · b2 fanout×2 wiring-only ·
b3 declining accounting · b4 throwing isolation (all logs + accounting) · b5 failure
visible as named failed traced exec + log + accounting · b6 quiet suppresses watch
(zero side effects) · b7 quiet passes warning · b8 watch outside window · b9 optional
absent delivers · b10 zero channels · b11 repeat alerts ordered per channel.

## Gate results (reference; verbatim in gates/reference-gates.log, checker JSON in gates/checker-reference.json)

| Gate | Command | Exit |
|---|---|---|
| lint | `node pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests` | 0 (0 diagnostics) |
| typecheck | `npx tsgo --noEmit` | 0 |
| tests | `npx vitest run` | 0 (8 passed) |
| smoke | `npx tsx bin/main.ts` | 0 (delivered warning + suppressed watch) |
| checker | `node --import tsx check-t8.mjs` | 0 (12/12 pass) |

lint dist sha256 at gate time recorded in gates/reference-gates.log header. Pinned lite
tarball 16001d13…e58a (dkr-5, not repacked).

## Adversarial results (both lint-clean — failures are purely behavioral)

| Adversarial | Construction | Verdict |
|---|---|---|
| transplant | invoice-triage shell: single `tags.required` notifier + default, one `notifier.send` edge | FAIL 8/12 (verdict.json) |
| fake | chal-2 H2-T8 attack verbatim: iterates `tags.all` registry, synthetic named `channel.<name>` edges, correct totals + quiet branching, never calls `send` | FAIL 9/12 (verdict.json) |

The fake is the amendment's proof: correct totals, correct trace names, correct optional
branching — killed only by per-channel call-log assertions.

## Replay

```
bash workers/pkr-t8/harness/instantiate-t8.sh workers/pkr-t8/reference-solution /tmp/<ws>
cd /tmp/<ws> && node <main>/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests \
  && npx tsgo --noEmit && npx vitest run && npx tsx bin/main.ts \
  && node --import tsx check-t8.mjs
```

## Residual attack classes (honest, see answer-key.md for detail)

- Concurrency not discriminated (sequential delivery passes; only prevent-, not delay-,
  isolation is enforced).
- `attempted` derivable from `channels.length` — pinned only jointly with call logs.
- Array-binding alternative shape closed by TASK's prescribed wiring, not by the library.

## Cut lines (budget)

- No third-tier adversarial (behavioral twin delivering via a hand-rolled non-graph
  dispatcher with real side effects — would pass most checks except b5's named-trace
  requirement; lint `no-unattributed-await` is the second wall). Chal-3 material.
- Checker does not itself re-run lint/tsgo/tests (separate gates, same as dkr-5).
