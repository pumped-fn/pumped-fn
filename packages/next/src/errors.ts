import { type StandardSchemaV1 } from "./types";
import { type Tag } from "./tag";
import { type ExecutionContext } from "./types";

export class SchemaError extends Error {
  static readonly CODE = "V001"
  readonly code: typeof SchemaError.CODE = SchemaError.CODE
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>

  constructor(issues: ReadonlyArray<StandardSchemaV1.Issue>) {
    super(`Schema validation failed: ${issues[0]?.message ?? "unknown error"}`)
    this.name = "SchemaError"
    this.issues = issues
  }
}

export class ExecutorResolutionError extends Error {
  static readonly CODE = "E001"
  readonly code: typeof ExecutorResolutionError.CODE = ExecutorResolutionError.CODE
  readonly executorName: string
  readonly dependencyChain: string[]
  readonly callSite?: string

  constructor(message: string, executorName: string, dependencyChain: string[], cause?: unknown, callSite?: string) {
    super(message, { cause })
    this.name = "ExecutorResolutionError"
    this.executorName = executorName
    this.dependencyChain = dependencyChain
    this.callSite = callSite
  }
}

export class FactoryExecutionError extends Error {
  static readonly CODE = "F001"
  readonly code: typeof FactoryExecutionError.CODE = FactoryExecutionError.CODE
  readonly executorName: string
  readonly dependencyChain: string[]
  readonly callSite?: string

  constructor(message: string, executorName: string, dependencyChain: string[], cause?: unknown, callSite?: string) {
    super(message, { cause })
    this.name = "FactoryExecutionError"
    this.executorName = executorName
    this.dependencyChain = dependencyChain
    this.callSite = callSite
  }
}

export class DependencyResolutionError extends Error {
  static readonly CODE = "D001"
  readonly code: typeof DependencyResolutionError.CODE = DependencyResolutionError.CODE
  readonly executorName: string
  readonly dependencyChain: string[]
  readonly missingDependency?: string
  readonly callSite?: string

  constructor(message: string, executorName: string, dependencyChain: string[], missingDependency?: string, cause?: unknown, callSite?: string) {
    super(message, { cause })
    this.name = "DependencyResolutionError"
    this.executorName = executorName
    this.dependencyChain = dependencyChain
    this.missingDependency = missingDependency
    this.callSite = callSite
  }
}

export class ExecutionContextClosedError extends Error {
  static readonly CODE = "EC001"
  readonly code: typeof ExecutionContextClosedError.CODE = ExecutionContextClosedError.CODE
  readonly contextId: string
  readonly state: string

  constructor(contextId: string, state: string) {
    super(`ExecutionContext ${contextId} is ${state}`)
    this.name = "ExecutionContextClosedError"
    this.contextId = contextId
    this.state = state
  }
}

export function createFactoryError(
  executorName: string,
  dependencyChain: string[],
  cause: unknown,
  callSite?: string
): FactoryExecutionError {
  const causeMsg = cause instanceof Error ? cause.message : String(cause)
  return new FactoryExecutionError(
    `Factory failed for "${executorName}": ${causeMsg}`,
    executorName,
    dependencyChain,
    cause,
    callSite
  )
}

export function createDependencyError(
  executorName: string,
  dependencyChain: string[],
  missingDependency?: string,
  cause?: unknown,
  callSite?: string
): DependencyResolutionError {
  const msg = missingDependency
    ? `Dependency "${missingDependency}" not found for "${executorName}"`
    : `Dependency resolution failed for "${executorName}"`
  return new DependencyResolutionError(msg, executorName, dependencyChain, missingDependency, cause, callSite)
}

export function createSystemError(
  executorName: string,
  dependencyChain: string[],
  cause?: unknown,
  callSite?: string
): ExecutorResolutionError {
  const causeMsg = cause instanceof Error ? cause.message : String(cause)
  return new ExecutorResolutionError(
    `System error for "${executorName}": ${causeMsg}`,
    executorName,
    dependencyChain,
    cause,
    callSite
  )
}

export function getExecutorName(executor: unknown): string {
  if (executor && typeof executor === "object" && "tags" in executor) {
    const container = executor as Tag.Container;
    const nameValue = container.tags?.["pumped-fn/name" as keyof typeof container.tags];
    if (typeof nameValue === "string") return nameValue;
  }

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
