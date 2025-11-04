import { Promised } from "./promises";
import { type Flow, type Core } from "./types";

type StatusCallback<T> = (
  status: Flow.ExecutionStatus,
  execution: Flow.FlowExecution<T>
) => void | Promise<void>;

type StatusTracking<T> = {
  promise: Promised<T>;
  timeoutId: ReturnType<typeof setTimeout> | null;
  abortController: AbortController;
};

export class FlowExecutionImpl<T> implements Flow.FlowExecution<T> {
  readonly result: Promised<T>;
  readonly id: string;
  readonly flowName: string | undefined;
  readonly abort: AbortController;

  private _status: Flow.ExecutionStatus = 'pending';
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
        console.error('Error in status change callback:', err);
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
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): PromiseLike<TResult1 | TResult2> {
    return this.result.then(onfulfilled, onrejected);
  }
}
