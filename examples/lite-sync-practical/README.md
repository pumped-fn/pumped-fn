# Lite Sync Practical

Production-shaped replicated draft state over Lite scopes.

The example uses `sync(...)` for editor state, `sync.extension()` at the composition boundary, and a
tag-injected memory transport for deterministic tests. The stress run records write overhead,
invalid payload rejection, conflict reporting, and final peer convergence without module mocks or
hidden globals.
