---
"@pumped-fn/lite": minor
---

Add opt-in serializable tag families. `serializable: true` constrains the value type to JSON-compatible data, checks defaults and writes at runtime, and exposes the marker on `Tag` and `Tagged` types as a base for persistence and synchronization adapters. Also export `assertSerializable()` for the same strict JSON value rule. Tag discovery and atom lookup now stay consistent when ESM and CommonJS entry points are loaded together.
