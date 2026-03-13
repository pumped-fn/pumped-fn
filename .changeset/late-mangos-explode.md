---
"@pumped-fn/lite": patch
---

Harden the `lite` type surface so runtime-invalid dependency shapes fail at compile
time. `watch: true` controller deps now only type-check in atom dependencies,
fake tag-like deps no longer satisfy the public overloads, and compile-only
fixtures lock the contract against regression.
