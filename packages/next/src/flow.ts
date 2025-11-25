import type { Core, Flow } from "./types"
import { createScope, type ScopeOption } from "./scope"
import type { Tag } from "./tag"
import { Promised } from "./primitives"
import { flowImpl, flowMeta } from "./execution-context"

type StatusCallback<T> = (
  status: Flow.ExecutionStatus,
  execution: Flow.Execution<T>
) => void | Promise<void>;

type StatusTracking<T> = {
  promise: Promised<T>;
  timeoutId: ReturnType<typeof setTimeout> | null;
  abortController: AbortController;
};

export class FlowExecutionImpl<T> implements Flow.Execution<T> {
  readonly result: Promised<T>;
  readonly id: string;
  readonly flowName: string | undefined;
  readonly abort: AbortController;

  private _status: Flow.ExecutionStatus = "pending";
  private statusCallbacks = new Set<StatusCallback<T>>();
  private callbackErrors: Error[] = [];
  private _ctx: Flow.ExecutionData | null;
  private statusTracking: StatusTracking<T> | null;
  private statusTrackingActive = false;

  constructor(config: {
    id: string;
    flowName: string | undefined;
    abort: AbortController;
    result: Promised<T>;
    ctx: Flow.ExecutionData | null;
    statusTracking?: StatusTracking<T>;
  }) {
    this.id = config.id;
    this.flowName = config.flowName;
    this.abort = config.abort;
    this._ctx = config.ctx;
    this.result = config.result;
    this.statusTracking = config.statusTracking ?? null;
  }

  get status(): Flow.ExecutionStatus {
    this["~ensureStatusTracking"]();
    return this._status;
  }

  get ctx(): Flow.ExecutionData | undefined {
    return this._ctx ?? undefined;
  }

  get statusCallbackErrors(): readonly Error[] {
    return this.callbackErrors;
  }

  "~setStatus"(newStatus: Flow.ExecutionStatus): void {
    if (this._status === newStatus) return;

    this._status = newStatus;

    for (const callback of this.statusCallbacks) {
      Promise.resolve(callback(newStatus, this)).catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.callbackErrors.push(error);
        console.error("Error in status change callback:", err);
      });
    }
  }

  "~setCtx"(ctx: Flow.ExecutionData): void {
    this._ctx = ctx;
  }

  private "~ensureStatusTracking"(): void {
    if (this.statusTrackingActive || !this.statusTracking) return;
    this.statusTrackingActive = true;

    const { promise, timeoutId, abortController } = this.statusTracking;

    void promise
      .then(async () => {
        const ctx = await promise.ctx().catch(() => undefined);
        if (ctx) this["~setCtx"](ctx);
        this["~setStatus"]("completed");
      })
      .catch(async () => {
        const ctx = await promise.ctx().catch(() => undefined);
        if (ctx) this["~setCtx"](ctx);
        if (abortController.signal.aborted) {
          this["~setStatus"]("cancelled");
        } else {
          this["~setStatus"]("failed");
        }
      })
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
  }

  onStatusChange(callback: StatusCallback<T>): Core.Cleanup {
    this["~ensureStatusTracking"]();
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined
  ): PromiseLike<TResult1 | TResult2> {
    return this.result.then(onfulfilled, onrejected);
  }
}

const normalizeExecuteOptions = (
  options?:
    | {
        scope: Core.Scope
        executionTags?: Tag.Tagged[]
        details?: boolean
      }
    | (Omit<ScopeOption, "tags"> & {
        scopeTags?: Tag.Tagged[]
        executionTags?: Tag.Tagged[]
        details?: boolean
      })
): {
  scope: Core.Scope
  disposeScope: boolean
  executionTags?: Tag.Tagged[]
  details: boolean
} => {
  if (options && "scope" in options) {
    return {
      scope: options.scope,
      disposeScope: false,
      executionTags: options.executionTags,
      details: options.details === true
    }
  }

  const scope = options
    ? createScope({
        initialValues: options.initialValues,
        registry: options.registry,
        extensions: options.extensions,
        tags: options.scopeTags
      })
    : createScope()

  return {
    scope,
    disposeScope: true,
    executionTags: options?.executionTags,
    details: options?.details === true
  }
}

const createExecutionDetailsResult = <S>(
  execution: Flow.Execution<S>,
  scopeToDispose?: Core.Scope
): Promised<Flow.ExecutionDetails<S>> => {
  const dispose = scopeToDispose
    ? async () => {
        await scopeToDispose.dispose()
      }
    : async () => {}

  return Promised.create(
    execution.result
      .then(async (result) => {
        await dispose()
        const ctx = await execution.result.ctx()
        if (!ctx) {
          throw new Error("Execution context not available")
        }
        return { success: true as const, result, ctx }
      })
      .catch(async (error) => {
        await dispose()
        const ctx = await execution.result.ctx()
        if (!ctx) {
          throw new Error("Execution context not available")
        }
        return { success: false as const, error, ctx }
      })
  )
}

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options: {
    scope: Core.Scope
    executionTags?: Tag.Tagged[]
    details: true
  }
): Promised<Flow.ExecutionDetails<S>>

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: {
    scope: Core.Scope
    executionTags?: Tag.Tagged[]
    details?: false
  }
): Promised<S>

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options: Omit<ScopeOption, "tags"> & {
    scopeTags?: Tag.Tagged[]
    executionTags?: Tag.Tagged[]
    details: true
  }
): Promised<Flow.ExecutionDetails<S>>

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: Omit<ScopeOption, "tags"> & {
    scopeTags?: Tag.Tagged[]
    executionTags?: Tag.Tagged[]
    details?: false
  }
): Promised<S>

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?:
    | {
        scope: Core.Scope
        executionTags?: Tag.Tagged[]
        details?: boolean
      }
    | (Omit<ScopeOption, "tags"> & {
        scopeTags?: Tag.Tagged[]
        executionTags?: Tag.Tagged[]
        details?: boolean
      })
): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
  const normalized = normalizeExecuteOptions(options)
  const execution = normalized.scope.exec({
    flow,
    input,
    tags: normalized.executionTags
  })

  if (normalized.details) {
    return createExecutionDetailsResult(
      execution,
      normalized.disposeScope ? normalized.scope : undefined
    )
  }

  if (normalized.disposeScope) {
    return Promised.create(
      execution.result
        .then((r) => normalized.scope.dispose().then(() => r))
        .catch(async (error) => {
          await normalized.scope.dispose()
          throw error
        }),
      execution.result.ctx()
    ) as Promised<S>
  }
  return execution.result
}

export const flow: typeof flowImpl & { execute: typeof execute } = Object.assign(
  flowImpl,
  { execute }
)

export { flowMeta }
