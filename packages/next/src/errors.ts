import {
  type ErrorContext,
  ExecutorResolutionError,
  FactoryExecutionError,
  DependencyResolutionError,
} from "./types";
import { type Tag } from "./tag-types";
import { name } from "./index";

export const codes = {
  FACTORY_EXECUTION_FAILED: "F001",
  FACTORY_THREW_ERROR: "F002",
  FACTORY_RETURNED_INVALID_TYPE: "F003",
  FACTORY_ASYNC_ERROR: "F004",

  DEPENDENCY_NOT_FOUND: "D001",
  CIRCULAR_DEPENDENCY: "D002",
  DEPENDENCY_RESOLUTION_FAILED: "D003",
  INVALID_DEPENDENCY_TYPE: "D004",
  DEPENDENCY_CHAIN_TOO_DEEP: "D005",

  SCOPE_DISPOSED: "S001",
  EXECUTOR_NOT_RESOLVED: "S002",
  INVALID_SCOPE_STATE: "S003",
  SCOPE_CLEANUP_FAILED: "S004",
  UPDATE_CALLBACK_ON_DISPOSING_SCOPE: "S006",

  SCHEMA_VALIDATION_FAILED: "V001",
  META_VALIDATION_FAILED: "V002",
  INPUT_TYPE_MISMATCH: "V003",
  OUTPUT_TYPE_MISMATCH: "V004",
  ASYNC_VALIDATION_NOT_SUPPORTED: "V005",

  INTERNAL_RESOLUTION_ERROR: "SYS001",
  CACHE_CORRUPTION: "SYS002",
  MEMORY_LEAK_DETECTED: "SYS003",
  PLUGIN_SYSTEM_ERROR: "SYS004",

  INVALID_EXECUTOR_CONFIG: "C001",
  MALFORMED_DEPENDENCIES: "C002",
  INVALID_FACTORY_SIGNATURE: "C003",
  PRESET_APPLICATION_FAILED: "C004",

  FLOW_EXECUTION_FAILED: "FL001",
  FLOW_CONTEXT_MISSING: "FL002",
  FLOW_PLUGIN_ERROR: "FL003",
  FLOW_INPUT_VALIDATION_FAILED: "FL004",
  FLOW_OUTPUT_VALIDATION_FAILED: "FL005",
} as const;

export type Code = (typeof codes)[keyof typeof codes];

const messages: Record<Code, string> = {
  [codes.FACTORY_EXECUTION_FAILED]:
    "Factory function execution failed for executor '{executorName}'. {cause}",
  [codes.FACTORY_THREW_ERROR]:
    "Factory function threw an error in executor '{executorName}': {originalMessage}",
  [codes.FACTORY_RETURNED_INVALID_TYPE]:
    "Factory function returned invalid type. Expected {expectedType}, got {actualType}",
  [codes.FACTORY_ASYNC_ERROR]:
    "Async factory function failed with error: {originalMessage}",

  [codes.DEPENDENCY_NOT_FOUND]:
    "Dependency '{dependencyName}' could not be resolved in the current scope",
  [codes.CIRCULAR_DEPENDENCY]:
    "Circular dependency detected in chain: {dependencyChain}",
  [codes.DEPENDENCY_RESOLUTION_FAILED]:
    "Failed to resolve dependencies for executor '{executorName}': {cause}",
  [codes.INVALID_DEPENDENCY_TYPE]:
    "Invalid dependency type provided. Expected Executor, got {actualType}",
  [codes.DEPENDENCY_CHAIN_TOO_DEEP]:
    "Dependency resolution chain exceeded maximum depth of {maxDepth}",

  [codes.SCOPE_DISPOSED]: "Cannot perform operation on disposed scope",
  [codes.EXECUTOR_NOT_RESOLVED]:
    "Executor '{executorName}' is not resolved. Call resolve() first or check if resolution failed",
  [codes.INVALID_SCOPE_STATE]:
    "Scope is in invalid state for this operation: {currentState}",
  [codes.SCOPE_CLEANUP_FAILED]: "Scope cleanup failed: {cause}",
  [codes.UPDATE_CALLBACK_ON_DISPOSING_SCOPE]:
    "Cannot register update callback on a disposing scope",

  [codes.SCHEMA_VALIDATION_FAILED]:
    "Schema validation failed: {validationMessage}",
  [codes.META_VALIDATION_FAILED]:
    "Meta validation failed for key '{metaKey}': {validationMessage}",
  [codes.INPUT_TYPE_MISMATCH]:
    "Input type validation failed: {validationMessage}",
  [codes.OUTPUT_TYPE_MISMATCH]:
    "Output type validation failed: {validationMessage}",
  [codes.ASYNC_VALIDATION_NOT_SUPPORTED]:
    "Async validation is not currently supported",

  [codes.INTERNAL_RESOLUTION_ERROR]:
    "Internal error during executor resolution. This is likely a bug in Pumped Functions",
  [codes.CACHE_CORRUPTION]:
    "Executor cache corruption detected. Scope integrity compromised",
  [codes.MEMORY_LEAK_DETECTED]:
    "Potential memory leak detected in scope {scopeId}",
  [codes.PLUGIN_SYSTEM_ERROR]: "Plugin system error: {pluginName} - {cause}",

  [codes.INVALID_EXECUTOR_CONFIG]:
    "Invalid executor configuration: {configError}",
  [codes.MALFORMED_DEPENDENCIES]:
    "Malformed dependency structure: {dependencyError}",
  [codes.INVALID_FACTORY_SIGNATURE]:
    "Factory function has invalid signature. Expected (dependencies, controller) => value",
  [codes.PRESET_APPLICATION_FAILED]: "Failed to apply preset: {presetError}",

  [codes.FLOW_EXECUTION_FAILED]: "Flow execution failed: {flowName}",
  [codes.FLOW_CONTEXT_MISSING]: "Flow execution context is missing or invalid",
  [codes.FLOW_PLUGIN_ERROR]: "Flow plugin '{pluginName}' failed: {cause}",
  [codes.FLOW_INPUT_VALIDATION_FAILED]:
    "Flow input validation failed: {validationMessage}",
  [codes.FLOW_OUTPUT_VALIDATION_FAILED]:
    "Flow output validation failed: {validationMessage}",
};

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
  const executorName = name.find(executor as Tag.Container);
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
