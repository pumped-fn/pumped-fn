---
"@pumped-fn/core-next": patch
---

Performance: WeakMap-based tag lookup caching (+6-151% improvements)

Implemented lazy Map-based caching for tag lookups using WeakMap:
- Cache automatically built on first lookup per source
- Stores values as arrays to support both single (`find`) and multiple (`some`) lookups
- WeakMap ensures automatic garbage collection when sources are no longer referenced

Performance improvements:
- Small arrays: +14-18% faster
- Medium arrays: +6-151% faster (huge improvement for last-match scenarios)
- Repeated lookups: +16% faster
- Collect multiple values: +52% faster

No breaking changes - 100% backward compatible.
