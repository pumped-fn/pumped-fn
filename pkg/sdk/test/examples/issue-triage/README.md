# Issue triage vertical

This runnable example proves an issue-triage flow without network access. Six Standard Schema boundaries validate intake, capability, evidence, hypothesis, independent verdict, and publication receipt data. Required tags supply every external edge, so a scope can replace GitHub intake and publication, repository reads, PostgreSQL read-only analysis, bounded Victoria telemetry, the model attempt, and the verifier.

```text
watcher(max 2) -> preflight -> session.run(agent.turn)
                                      |
                     evidence tool(3 required ports)
                                      |
                               verifier -> publisher
```

The application preflights containment, read-only SQL, the Victoria window, and session authority before the model runs. The session turn receives one composite evidence tool through per-execution tags. That tool declares all three physical ports in its static graph. `session.observation.current` gives the test extension a narrow work projection for each concurrent activation.

Run the 16-contract verifier:

```bash
./node_modules/.bin/vitest run --config pkg/sdk/test/vitest.config.ts pkg/sdk/test/tests/issue-triage.test.ts
```

The example uses Zod through the Standard Schema interface for both agent tool input and the six application boundaries. Replace the two validation engine tags with Valibot-backed engines to change validation without changing the graph.
