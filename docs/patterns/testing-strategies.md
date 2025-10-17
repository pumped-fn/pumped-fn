# Testing Strategies

Testing with Pumped-FN leverages the dependency graph to make test isolation and mocking straightforward.

## Preset Mocking

Use `preset` to swap executor implementations with mocks for testing.

### Basic Mocking

Replace a single dependency with a mock:

<<< @/code/testing-patterns.ts#preset-mock-basic

**Key Points:**
- Mock replaces the real implementation
- Downstream executors receive the mock automatically
- Original graph structure remains intact

### Multiple Dependencies

Mock multiple dependencies in a single scope:

<<< @/code/testing-patterns.ts#preset-multiple

**Best Practices:**
- Mock at service boundaries
- Keep mocks simple and focused
- Verify interactions with spy functions
- Always dispose test scopes

## When to Use Presets

- **Unit Testing**: Isolate logic by mocking dependencies
- **Integration Testing**: Mix real and mock implementations
- **Flaky Test Debugging**: Replace unreliable services temporarily
