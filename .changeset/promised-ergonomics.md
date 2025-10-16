---
"@pumped-fn/core-next": patch
---

Add Promised.create static factory method and make extension API accept both Promise and Promised types

- Add `Promised.create()` static method as preferred way to create Promised instances
- Replace all 43 internal uses of `new Promised` with `Promised.create`
- Extension API now accepts both `Promise<T>` and `Promised<T>` return types
- Extension methods (init, initPod, wrap, dispose, disposePod) handle both types seamlessly
- Internal automatic wrapping to Promised for better ergonomics
- No breaking changes - fully backward compatible
