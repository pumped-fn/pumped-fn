---
"@pumped-fn/core-next": patch
---

Remove presets from scope.exec() options and update documentation to remove pod concept

Breaking API change: Removed 'presets' option from scope.exec() - use createScope({ initialValues: [...] }) for preset values instead. Updated Flow.Context to expose 'scope' property instead of 'pod'. Documentation updated to reflect pod removal and new Promised utilities.
