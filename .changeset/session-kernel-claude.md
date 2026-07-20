---
"@pumped-fn/sdk-claude": major
---

Replace the provider factory and re-exported core harnesses with stable module-level Claude config, run, turn, model, attempt, and lease handles. Provider-neutral streaming attempts use isolated sequential process leases keyed to the active session, work, and authority.

Validate session provenance and canonical roots before process creation. Abort and consumer cancellation release only the selected lease, child process failures poison queued work before it starts, and bounded shutdown fails closed when the process remains alive.
