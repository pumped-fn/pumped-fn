---
"@pumped-fn/devtools": minor
---

Add IPC transport and standalone CLI binary for multi-process monitoring

- Implemented IPC transport using Unix sockets for inter-process communication
- Added standalone `pumped-cli` binary for running devtools as separate process
- Multi-scope monitoring - track multiple application scopes simultaneously
- Silent degradation with automatic retry and message buffering
- Transport abstraction supporting both in-memory and IPC modes
