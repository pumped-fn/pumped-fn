import { 
  ErrorContext, 
  ExecutorResolutionError, 
  FactoryExecutionError, 
  DependencyResolutionError 
} from "./types";

/**
 * Systematic error codes for Pumped Functions
 */
export const ErrorCodes = {
  // Factory Execution Errors (F000-F999)
  FACTORY_EXECUTION_FAILED: "F001",
  FACTORY_THREW_ERROR: "F002", 
  FACTORY_RETURNED_INVALID_TYPE: "F003",
  FACTORY_ASYNC_ERROR: "F004",
  FACTORY_GENERATOR_ERROR: "F005",

  // Dependency Resolution Errors (D000-D999)
  DEPENDENCY_NOT_FOUND: "D001",
  CIRCULAR_DEPENDENCY: "D002",
  DEPENDENCY_RESOLUTION_FAILED: "D003",
  INVALID_DEPENDENCY_TYPE: "D004",
  DEPENDENCY_CHAIN_TOO_DEEP: "D005",

  // Scope & Lifecycle Errors (S000-S999)
  SCOPE_DISPOSED: "S001",
  EXECUTOR_NOT_RESOLVED: "S002",
  INVALID_SCOPE_STATE: "S003",
  SCOPE_CLEANUP_FAILED: "S004",
  REACTIVE_EXECUTOR_IN_POD: "S005",
  UPDATE_CALLBACK_ON_DISPOSING_SCOPE: "S006",

  // Validation Errors (V000-V999)
  SCHEMA_VALIDATION_FAILED: "V001",
  META_VALIDATION_FAILED: "V002",
  INPUT_TYPE_MISMATCH: "V003",
  OUTPUT_TYPE_MISMATCH: "V004",
  ASYNC_VALIDATION_NOT_SUPPORTED: "V005",

  // System Errors (SYS000-SYS999)
  INTERNAL_RESOLUTION_ERROR: "SYS001",
  CACHE_CORRUPTION: "SYS002",
  MEMORY_LEAK_DETECTED: "SYS003",
  PLUGIN_SYSTEM_ERROR: "SYS004",

  // Configuration Errors (C000-C999)
  INVALID_EXECUTOR_CONFIG: "C001",
  MALFORMED_DEPENDENCIES: "C002",
  INVALID_FACTORY_SIGNATURE: "C003",
  PRESET_APPLICATION_FAILED: "C004",

  // Flow System Errors (FL000-FL999)
  FLOW_EXECUTION_FAILED: "FL001",
  FLOW_CONTEXT_MISSING: "FL002",
  FLOW_PLUGIN_ERROR: "FL003",
  FLOW_INPUT_VALIDATION_FAILED: "FL004",
  FLOW_OUTPUT_VALIDATION_FAILED: "FL005",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Error message templates with placeholder support
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Factory Execution Errors
  [ErrorCodes.FACTORY_EXECUTION_FAILED]: "Factory function execution failed for executor '{executorName}'. {cause}",
  [ErrorCodes.FACTORY_THREW_ERROR]: "Factory function threw an error in executor '{executorName}': {originalMessage}",
  [ErrorCodes.FACTORY_RETURNED_INVALID_TYPE]: "Factory function returned invalid type. Expected {expectedType}, got {actualType}",
  [ErrorCodes.FACTORY_ASYNC_ERROR]: "Async factory function failed with error: {originalMessage}",
  [ErrorCodes.FACTORY_GENERATOR_ERROR]: "Generator factory function failed during execution: {originalMessage}",

  // Dependency Resolution Errors  
  [ErrorCodes.DEPENDENCY_NOT_FOUND]: "Dependency '{dependencyName}' could not be resolved in the current scope",
  [ErrorCodes.CIRCULAR_DEPENDENCY]: "Circular dependency detected in chain: {dependencyChain}",
  [ErrorCodes.DEPENDENCY_RESOLUTION_FAILED]: "Failed to resolve dependencies for executor '{executorName}': {cause}",
  [ErrorCodes.INVALID_DEPENDENCY_TYPE]: "Invalid dependency type provided. Expected Executor, got {actualType}",
  [ErrorCodes.DEPENDENCY_CHAIN_TOO_DEEP]: "Dependency resolution chain exceeded maximum depth of {maxDepth}",

  // Scope & Lifecycle Errors
  [ErrorCodes.SCOPE_DISPOSED]: "Cannot perform operation on disposed scope",
  [ErrorCodes.EXECUTOR_NOT_RESOLVED]: "Executor '{executorName}' is not resolved. Call resolve() first or check if resolution failed",
  [ErrorCodes.INVALID_SCOPE_STATE]: "Scope is in invalid state for this operation: {currentState}",
  [ErrorCodes.SCOPE_CLEANUP_FAILED]: "Scope cleanup failed: {cause}",
  [ErrorCodes.REACTIVE_EXECUTOR_IN_POD]: "Reactive executors cannot be used in pod environments",
  [ErrorCodes.UPDATE_CALLBACK_ON_DISPOSING_SCOPE]: "Cannot register update callback on a disposing scope",

  // Validation Errors
  [ErrorCodes.SCHEMA_VALIDATION_FAILED]: "Schema validation failed: {validationMessage}",
  [ErrorCodes.META_VALIDATION_FAILED]: "Meta validation failed for key '{metaKey}': {validationMessage}",
  [ErrorCodes.INPUT_TYPE_MISMATCH]: "Input type validation failed: {validationMessage}",
  [ErrorCodes.OUTPUT_TYPE_MISMATCH]: "Output type validation failed: {validationMessage}", 
  [ErrorCodes.ASYNC_VALIDATION_NOT_SUPPORTED]: "Async validation is not currently supported",

  // System Errors
  [ErrorCodes.INTERNAL_RESOLUTION_ERROR]: "Internal error during executor resolution. This is likely a bug in Pumped Functions",
  [ErrorCodes.CACHE_CORRUPTION]: "Executor cache corruption detected. Scope integrity compromised",
  [ErrorCodes.MEMORY_LEAK_DETECTED]: "Potential memory leak detected in scope {scopeId}",
  [ErrorCodes.PLUGIN_SYSTEM_ERROR]: "Plugin system error: {pluginName} - {cause}",

  // Configuration Errors
  [ErrorCodes.INVALID_EXECUTOR_CONFIG]: "Invalid executor configuration: {configError}",
  [ErrorCodes.MALFORMED_DEPENDENCIES]: "Malformed dependency structure: {dependencyError}",
  [ErrorCodes.INVALID_FACTORY_SIGNATURE]: "Factory function has invalid signature. Expected (dependencies, controller) => value",
  [ErrorCodes.PRESET_APPLICATION_FAILED]: "Failed to apply preset: {presetError}",

  // Flow System Errors
  [ErrorCodes.FLOW_EXECUTION_FAILED]: "Flow execution failed: {flowName}",
  [ErrorCodes.FLOW_CONTEXT_MISSING]: "Flow execution context is missing or invalid",
  [ErrorCodes.FLOW_PLUGIN_ERROR]: "Flow plugin '{pluginName}' failed: {cause}",
  [ErrorCodes.FLOW_INPUT_VALIDATION_FAILED]: "Flow input validation failed: {validationMessage}",
  [ErrorCodes.FLOW_OUTPUT_VALIDATION_FAILED]: "Flow output validation failed: {validationMessage}",
};

/**
 * Utility function to format error messages with context
 */
export function formatErrorMessage(code: ErrorCode, context: Record<string, unknown> = {}): string {
  let message = ErrorMessages[code];
  
  // Replace placeholders with actual values
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{${key}}`;
    message = message.replace(new RegExp(placeholder, 'g'), String(value));
  }
  
  return message;
}

/**
 * Utility functions for creating enhanced errors with proper context
 */
export function createFactoryError(
  code: ErrorCode,
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
    originalMessage: originalError instanceof Error ? originalError.message : String(originalError),
    cause: originalError instanceof Error ? originalError.message : String(originalError),
    ...additionalContext,
  };

  const message = formatErrorMessage(code, messageContext);

  return new FactoryExecutionError(message, context, code, {
    cause: originalError,
  });
}

export function createDependencyError(
  code: ErrorCode,
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
    dependencyChain: dependencyChain.join(' -> '),
    cause: originalError instanceof Error ? originalError.message : String(originalError),
    ...additionalContext,
  };

  const message = formatErrorMessage(code, messageContext);

  return new DependencyResolutionError(message, context, code, missingDependency, {
    cause: originalError,
  });
}

export function createSystemError(
  code: ErrorCode,
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
    cause: originalError instanceof Error ? originalError.message : String(originalError),
    ...additionalContext,
  };

  const message = formatErrorMessage(code, messageContext);

  return new ExecutorResolutionError(message, context, code, "SYSTEM_ERROR", {
    cause: originalError,
  });
}

/**
 * Helper to extract executor name from executor object for error context
 */
export function getExecutorName(executor: any): string {
  // Try to find name from meta information
  if (executor?.metas && Array.isArray(executor.metas)) {
    for (const meta of executor.metas) {
      // Check if the meta key is a symbol that represents a name
      if (meta?.key && typeof meta.key === 'symbol') {
        const keyString = meta.key.toString();
        if (keyString.includes('name') || keyString.includes('pumped-fn/name')) {
          return String(meta.value);
        }
      }
      // Also check string keys for backward compatibility
      if (typeof meta?.key === 'string' && meta.key.includes('name')) {
        return String(meta.value);
      }
    }
  }
  
  // Try to extract from factory function name if available
  if (executor?.factory?.name && executor.factory.name !== 'factory') {
    return executor.factory.name;
  }
  
  // Create a basic identifier based on executor structure
  if (executor) {
    const kind = executor[Symbol.for("@pumped-fn/core/executor")] || 'unknown';
    return `${kind}-executor-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  return 'unknown-executor';
}

/**
 * Helper to build dependency chain for error context
 */
export function buildDependencyChain(executorStack: any[]): string[] {
  return executorStack.map(executor => getExecutorName(executor));
}