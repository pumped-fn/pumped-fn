---
id: c3-105
c3-version: 3
title: Error Classes
summary: >
  Structured error hierarchy with context-rich error reporting.
---

# Error Classes

## Overview {#c3-105-overview}
<!-- Structured error handling -->

The error system provides:

- **Error classes** - Typed hierarchy for different failure modes
- **Error codes** - Unique identifiers for programmatic handling
- **Error catalog** - Centralized message templates
- **Context** - Rich debugging information (executor name, dependency chain, timestamp)

Errors carry enough context to diagnose issues without needing to reproduce them.

## Error Hierarchy {#c3-105-hierarchy}

| Error Class | Base | When Thrown |
|-------------|------|-------------|
| `SchemaError` | Error | Schema validation failure |
| `ExecutorResolutionError` | Error | Generic resolution failure |
| `FactoryExecutionError` | ExecutorResolutionError | Factory threw during resolution |
| `DependencyResolutionError` | ExecutorResolutionError | Dependency could not be resolved |
| `FlowError` | Error | Flow-level descriptive error |
| `FlowValidationError` | FlowError | Flow input/output validation failed |

### ExecutorResolutionError

Base class for resolution failures. Contains:

| Property | Type | Description |
|----------|------|-------------|
| `context` | ErrorContext | Rich debugging context |
| `code` | Code | Error code from catalog |
| `category` | string | Error category |

### FactoryExecutionError

Thrown when a factory function fails:

- Factory threw an exception
- Factory returned invalid type
- Async factory rejected

### DependencyResolutionError

Thrown when dependency resolution fails:

- Dependency not found
- Circular dependency detected
- Dependency chain too deep

## Error Codes {#c3-105-codes}

Codes are organized by category:

| Prefix | Category | Examples |
|--------|----------|----------|
| `F0XX` | Factory | F001 execution failed, F002 threw error |
| `D0XX` | Dependency | D001 not found, D002 circular, D003 resolution failed |
| `S0XX` | Scope | S001 disposed, S002 not resolved |
| `V0XX` | Validation | V001 schema failed, V003 input mismatch |
| `C0XX` | Configuration | C001 invalid config, C002 malformed deps |
| `FL0XX` | Flow | FL001 execution failed, FL004 input validation |
| `SYS0XX` | System | SYS001 internal error, SYS002 cache corruption |

### Common Codes

| Code | Description |
|------|-------------|
| `F001` | Factory function execution failed |
| `F002` | Factory function threw an error |
| `D001` | Dependency not found in scope |
| `D002` | Circular dependency detected |
| `D003` | Failed to resolve dependencies |
| `S001` | Cannot operate on disposed scope |
| `V001` | Schema validation failed |
| `FL001` | Flow execution failed |
| `FL004` | Flow input validation failed |
| `FL005` | Flow output validation failed |

## Error Context {#c3-105-context}

Every resolution error includes rich context:

| Field | Type | Description |
|-------|------|-------------|
| `executorName` | string | Name of failing executor |
| `dependencyChain` | string[] | Path from root to failure |
| `resolutionStage` | string | Where in resolution it failed |
| `timestamp` | number | When error occurred |
| `additionalInfo` | object | Extra debugging data |

**Example:**
```
FactoryExecutionError: Factory function threw an error in executor 'UserService': Connection refused
  code: F002
  context: {
    executorName: 'UserService',
    dependencyChain: ['AppRoot', 'AuthService', 'UserService'],
    timestamp: 1700000000000
  }
```

## Error Factory Functions {#c3-105-factories}

| Function | Creates | Use Case |
|----------|---------|----------|
| `createFactoryError(code, name, chain, originalError)` | FactoryExecutionError | Factory threw/failed |
| `createDependencyError(code, name, chain, missingDep)` | DependencyResolutionError | Dependency issues |
| `createSystemError(code, name, chain, originalError)` | ExecutorResolutionError | Internal errors |

## Message Formatting {#c3-105-messages}

Messages use template placeholders:

```typescript
"Factory function threw an error in executor '{executorName}': {originalMessage}"
```

`formatMessage(code, context)` replaces placeholders with actual values.

## Helper Functions {#c3-105-helpers}

| Function | Purpose |
|----------|---------|
| `getExecutorName(executor)` | Extract name from executor (uses name tag) |
| `buildDependencyChain(stack)` | Convert executor stack to name array |

## Source Files {#c3-105-source}

| File | Contents |
|------|----------|
| `errors.ts` | Error catalog, codes, factory functions, formatMessage |
| `types.ts` | Error class definitions (SchemaError, ExecutorResolutionError, etc.) |

## Testing {#c3-105-testing}

Primary tests: `index.test.ts` - "Error Classes" describe block

Key test scenarios:
- SchemaError with validation issues
- ExecutorResolutionError with dependency chain
- FactoryExecutionError wrapping factory errors
- DependencyResolutionError for missing deps
- ExecutionContextClosedError state validation
- FlowError and FlowValidationError
