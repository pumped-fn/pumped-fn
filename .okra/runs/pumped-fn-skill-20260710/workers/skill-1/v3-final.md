Changed:

- [SKILL.md](/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/skills/pumped-fn/SKILL.md) — 11,189 B
- [extensions.md](/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/skills/pumped-fn/references/extensions.md) — 5,688 B
- [review.md](/home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill/skills/pumped-fn/references/review.md) — 5,892 B

Fix 1: rewrote scheduler guidance with the Lite-4 install caveat, `inProcess()` limited to `catchUp: "skip"`, explicit `await registration.stop()` before disposal, and a durable `Scheduler.Backend` skeleton using store + clock. Cite-checked against `workers/val-2/audit.md`, `workers/pkr-t3/reference-solution/src/backend.ts`, and the supplied scheduler tarball’s `dist/index.d.mts`.

Fix 2: added all requested trap rules: fn `params`, `isFault` identity, transparent `prepare`, `tags.all` asymmetry, controller replacement preference, scope/composition lint behavior, module-state/await/timer lint traps, atom naming, extension attribution, and resource-watch topology. Cite-checked against the named `pkr-t1`, `t4`, `t5`, `t6`, `t8`, `t9`, and `t10` worker artifacts plus Lite source.

Fix 3: added preference-tier review rows for one prepare site, `ctrl.set`, scheduler teardown, and named factory observability.

Verification outputs:

```text
npm error code EROFS
npm error syscall mkdtemp
npm error path /home/lagz0ne/.npm/_cacache/tmp/Bdp9Nc
npm error errno -30
npm error rofs EROFS: read-only file system, mkdtemp '/home/lagz0ne/.npm/_cacache/tmp/Bdp9Nc'
```

```text
npm error code ENOTCACHED
npm error request to https://registry.npmjs.org/@types%2fnode failed: cache mode is 'only-if-cached' but no cached response is available.
```

The required scheduler/Lite harness typecheck could not complete: network is sandboxed, the shared npm cache is read-only, and the T-3 harness requires uncached `@types/node`. An attempted cache copy filled `/tmp`, after which the sandbox could no longer launch commands (`No space left on device`). No skill files outside the requested directory were changed.

questions_unanswered:

- Whether the validation environment can provide writable cached dependencies or clear `/tmp` so the required replay can run.