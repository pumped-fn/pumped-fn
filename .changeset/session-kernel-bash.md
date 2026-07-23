---
"@pumped-fn/sdk-just-bash": major
---

Replace the sandbox method bag with session-mediated read, write, and exec port flows. Add explicit authority, readiness, workspace, and engine resources with cancellation, timeout, output-cap, path, command, and session-isolation checks.

The exec port is stream-compatible, while the just-bash backend emits at most one buffered stdout event and one buffered stderr event after command completion.
