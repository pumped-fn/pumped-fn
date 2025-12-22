---
"@pumped-fn/lite": minor
---

Add automatic garbage collection for atoms

- Atoms are automatically released when they have no subscribers after a configurable grace period (default 3000ms)
- Cascading GC: dependencies are protected while dependents are mounted
- New `keepAlive: true` option on atoms to prevent auto-release
- New `gc: { enabled, graceMs }` option on `createScope()` to configure or disable GC
- React Strict Mode compatible via grace period (handles double-mount/unmount)
- Disable with `createScope({ gc: { enabled: false } })` to preserve pre-1.11 behavior
