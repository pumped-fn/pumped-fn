# @pumped-fn/lite-lint

## 0.2.1

### Patch Changes

- dc60cea: Add a `pumped/no-direct-flow-composition` rule that requires flow-to-flow composition to use explicit `controller(childFlow)` dependencies instead of hidden direct flow execution.

## 0.2.0

### Minor Changes

- Add `useFlow` for React feature components, update examples to dispatch flows through the hook, and add a Lightpanda browser smoke gate for the `useFlow` integration.

  Add a lite-lint rule that blocks feature components from calling `useExecutionContext` directly.

## 0.1.0

### Minor Changes

- e0cc714: Add a lint-like anti-pattern scanner for lite and lite-react boundary rules.
