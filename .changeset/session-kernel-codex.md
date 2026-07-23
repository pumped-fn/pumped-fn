---
"@pumped-fn/sdk-codex": major
---

Replace the provider factory and re-exported core harnesses with stable Codex CLI and ACP config, run, turn, model, and attempt handles. Both providers expose normalized streaming attempts; scalar turns drain the same paths.

Require an absolute CLI working directory and bind canonical, symlink-resolved CLI and ACP roots, write access, and network access to current SDK work authority. CLI extra arguments use a harmless allowlist. ACP continuations are reserved per session branch and authority, cancellation replaces timed-out transports, and failed termination quarantines the live invocation so session finish remains fenced.
