import {
  type ErrorContext,
  ExecutorResolutionError,
  FactoryExecutionError,
  DependencyResolutionError,
} from "./types";
import { type Tag } from "./tag-types";
import { name } from "./index";

const errorCatalog = {
  FACTORY_EXECUTION_FAILED: {
    code: "F001",
    message:
      "Factory function execution failed for executor '{executorName}'. {cause}",
  },
  FACTORY_THREW_ERROR: {
    code: "F002",
    message:
      "Factory function threw an error in executor '{executorName}': {originalMessage}",
  },
  FACTORY_RETURNED_INVALID_TYPE: {
    code: "F003",
    message:
      "Factory function returned invalid type. Expected {expectedType}, got {actualType}",
  },
  FACTORY_ASYNC_ERROR: {
    code: "F004",
    message: "Async factory function failed with error: {originalMessage}",
  },
  DEPENDENCY_NOT_FOUND: {
    code: "D001",
    message:
      "Dependency '{dependencyName}' could not be resolved in the current scope",
  },
  CIRCULAR_DEPENDENCY: {
    code: "D002",
    message: "Circular dependency detected in chain: {dependencyChain}",
  },
  DEPENDENCY_RESOLUTION_FAILED: {
    code: "D003",
    message:
      "Failed to resolve dependencies for executor '{executorName}': {cause}",
  },
  INVALID_DEPENDENCY_TYPE: {
    code: "D004",
    message:
      "Invalid dependency type provided. Expected Executor, got {actualType}",
  },
  DEPENDENCY_CHAIN_TOO_DEEP: {
    code: "D005",
    message:
      "Dependency resolution chain exceeded maximum depth of {maxDepth}",
  },
  SCOPE_DISPOSED: {
    code: "S001",
    message: "Cannot perform operation on disposed scope",
  },
  EXECUTOR_NOT_RESOLVED: {
    code: "S002",
    message:
      "Executor '{executorName}' is not resolved. Call resolve() first or check if resolution failed",
  },
  INVALID_SCOPE_STATE: {
    code: "S003",
    message: "Scope is in invalid state for this operation: {currentState}",
  },
  SCOPE_CLEANUP_FAILED: {
    code: "S004",
    message: "Scope cleanup failed: {cause}",
  },
  UPDATE_CALLBACK_ON_DISPOSING_SCOPE: {
    code: "S006",
    message: "Cannot register update callback on a disposing scope",
  },
  SCHEMA_VALIDATION_FAILED: {
    code: "V001",
    message: "Schema validation failed: {validationMessage}",
  },
  META_VALIDATION_FAILED: {
    code: "V002",
    message:
      "Meta validation failed for key '{metaKey}': {validationMessage}",
  },
  INPUT_TYPE_MISMATCH: {
    code: "V003",
    message: "Input type validation failed: {validationMessage}",
  },
  OUTPUT_TYPE_MISMATCH: {
    code: "V004",
    message: "Output type validation failed: {validationMessage}",
  },
  ASYNC_VALIDATION_NOT_SUPPORTED: {
    code: "V005",
    message: "Async validation is not currently supported",
  },
  INTERNAL_RESOLUTION_ERROR: {
    code: "SYS001",
    message:
      "Internal error during executor resolution. This is likely a bug in Pumped Functions",
  },
  CACHE_CORRUPTION: {
    code: "SYS002",
    message: "Executor cache corruption detected. Scope integrity compromised",
  },
  MEMORY_LEAK_DETECTED: {
    code: "SYS003",
    message: "Potential memory leak detected in scope {scopeId}",
  },
  PLUGIN_SYSTEM_ERROR: {
    code: "SYS004",
    message: "Plugin system error: {pluginName} - {cause}",
  },
  INVALID_EXECUTOR_CONFIG: {
    code: "C001",
    message: "Invalid executor configuration: {configError}",
  },
  MALFORMED_DEPENDENCIES: {
    code: "C002",
    message: "Malformed dependency structure: {dependencyError}",
  },
  INVALID_FACTORY_SIGNATURE: {
    code: "C003",
    message:
      "Factory function has invalid signature. Expected (dependencies, controller) => value",
  },
  PRESET_APPLICATION_FAILED: {
    code: "C004",
    message: "Failed to apply preset: {presetError}",
  },
  FLOW_EXECUTION_FAILED: {
    code: "FL001",
    message: "Flow execution failed: {flowName}",
  },
  FLOW_CONTEXT_MISSING: {
    code: "FL002",
    message: "Flow execution context is missing or invalid",
  },
  FLOW_PLUGIN_ERROR: {
    code: "FL003",
    message: "Flow plugin '{pluginName}' failed: {cause}",
  },
  FLOW_INPUT_VALIDATION_FAILED: {
    code: "FL004",
    message: "Flow input validation failed: {validationMessage}",
  },
  FLOW_OUTPUT_VALIDATION_FAILED: {
    code: "FL005",
    message: "Flow output validation failed: {validationMessage}",
  },
} as const;

type ErrorCatalog = typeof errorCatalog;

export type Code = ErrorCatalog[keyof ErrorCatalog]["code"];

const buildCodes = (): { [K in keyof ErrorCatalog]: ErrorCatalog[K]["code"] } => {
  const entries = Object.keys(errorCatalog).map((key) => {
    const catalogKey = key as keyof ErrorCatalog
    return [catalogKey, errorCatalog[catalogKey].code] as const
  })
  return Object.fromEntries(entries) as {
    [K in keyof ErrorCatalog]: ErrorCatalog[K]["code"]
  }
}

const buildMessages = (): Record<Code, string> => {
  const entries = Object.keys(errorCatalog).map((key) => {
    const entry = errorCatalog[key as keyof ErrorCatalog]
    return [entry.code, entry.message] as const
  })
  return Object.fromEntries(entries) as Record<Code, string>
}

export const codes: { [K in keyof ErrorCatalog]: ErrorCatalog[K]["code"] } = buildCodes()
const messages: Record<Code, string> = buildMessages()

export function formatMessage(
  code: Code,
  context: Record<string, unknown> = {}
): string {
  let message = messages[code];

  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{${key}}`;
    message = message.replaceAll(placeholder, String(value));
  }

  return message;
}

export function createFactoryError(
  code: Code,
  executorName: string,
  dependencyChain: string[],
  originalError?: unknown,
  additionalContext: Record<string, unknown> = {}
): FactoryExecutionError {
  const context: Omit<ErrorContext, "resolutionStage"> = {
    executorName,
    dependencyChain,
    timestamp: Date.now(),
    additionalInfo: additionalContext,
  };

  const messageContext = {
    executorName,
    originalMessage:
      originalError instanceof Error
        ? originalError.message
        : String(originalError),
    cause:
      originalError instanceof Error
        ? originalError.message
        : String(originalError),
    ...additionalContext,
  };

  const message = formatMessage(code, messageContext);

  return new FactoryExecutionError(message, context, code, {
    cause: originalError,
  });
}

export function createDependencyError(
  code: Code,
  executorName: string,
  dependencyChain: string[],
  missingDependency?: string,
  originalError?: unknown,
  additionalContext: Record<string, unknown> = {}
): DependencyResolutionError {
  const context: Omit<ErrorContext, "resolutionStage"> = {
    executorName,
    dependencyChain,
    timestamp: Date.now(),
    additionalInfo: additionalContext,
  };

  const messageContext = {
    executorName,
    dependencyName: missingDependency,
    dependencyChain: dependencyChain.join(" -> "),
    cause:
      originalError instanceof Error
        ? originalError.message
        : String(originalError),
    ...additionalContext,
  };

  const message = formatMessage(code, messageContext);

  return new DependencyResolutionError(
    message,
    context,
    code,
    missingDependency,
    {
      cause: originalError,
    }
  );
}

export function createSystemError(
  code: Code,
  executorName: string,
  dependencyChain: string[],
  originalError?: unknown,
  additionalContext: Record<string, unknown> = {}
): ExecutorResolutionError {
  const context: ErrorContext = {
    executorName,
    dependencyChain,
    resolutionStage: "post-processing",
    timestamp: Date.now(),
    additionalInfo: additionalContext,
  };

  const messageContext = {
    executorName,
    cause:
      originalError instanceof Error
        ? originalError.message
        : String(originalError),
    ...additionalContext,
  };

  const message = formatMessage(code, messageContext);

  return new ExecutorResolutionError(message, context, code, "SYSTEM_ERROR", {
    cause: originalError,
  });
}

export function getExecutorName(executor: unknown): string {
  const executorName = name.readFrom(executor as Tag.Container);
  if (executorName) return executorName;

  if (executor && typeof executor === "object" && "factory" in executor) {
    const factory = executor.factory as { name?: string } | undefined;
    if (factory?.name && factory.name !== "factory") {
      return factory.name;
    }
  }

  if (executor && typeof executor === "object") {
    const kind =
      (executor as Record<symbol, unknown>)[
        Symbol.for("@pumped-fn/core/executor")
      ] ?? "unknown";
    return `${String(kind)}-executor-${Math.random()
      .toString(36)
      .substring(2, 11)}`;
  }

  return "unknown-executor";
}

export function buildDependencyChain(executorStack: unknown[]): string[] {
  return executorStack.map(getExecutorName);
}
