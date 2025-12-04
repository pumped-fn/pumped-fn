---
"@pumped-fn/react-lite": minor
---

feat(react-lite): initial release of React integration for @pumped-fn/lite

Adds minimal React bindings with Suspense and ErrorBoundary integration:
- ScopeProvider and ScopeContext for scope provisioning
- useScope hook for accessing scope from context
- useController hook for obtaining memoized controllers
- useAtom hook with full Suspense/ErrorBoundary integration
- useSelect hook for fine-grained reactivity with custom equality

SSR-compatible, zero-tolerance for `any` types, comprehensive TSDoc.
