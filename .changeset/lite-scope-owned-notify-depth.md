---
"@pumped-fn/lite": patch
---

Listener-notification depth is now scope-owned instead of a module-global counter.
Previously, a listener firing in one scope made every other live scope in the process
classify concurrently scheduled invalidations as "tainted" (forced re-execution,
cascade dedup suppressed) — cross-scope interference that cannot be reproduced or
controlled through the scope seam. The depth now lives on the scope and is threaded
through the notify helpers and select handles; all invalidation state stays
scope-owned. No behavior change for single-scope processes.
