import { Promised } from "./promises";
import { type Flow, type Core } from "./types";

type StatusCallback<T> = (
  status: Flow.ExecutionStatus,
  execution: Flow.FlowExecution<T>
) => void | Promise<void>;

export class FlowExecutionImpl<T> implements Flow.FlowExecution<T>, PromiseLike<T> {
  readonly result: Promised<T>;
  readonly id: string;
  readonly flowName: string | undefined;
  readonly abort: AbortController;

  private _status: Flow.ExecutionStatus = 'pending';
  private statusCallbacks = new Set<StatusCallback<T>>();
  private _ctx: Flow.ExecutionData | null;

  constructor(config: {
    id: string;
    flowName: string | undefined;
    abort: AbortController;
    result: Promised<T>;
    ctx: Flow.ExecutionData | null;
  }) {
    this.id = config.id;
    this.flowName = config.flowName;
    this.abort = config.abort;
    this._ctx = config.ctx;
    this.result = config.result;
  }

  get status(): Flow.ExecutionStatus {
    return this._status;
  }

  get ctx(): Flow.ExecutionData | undefined {
    return this._ctx ?? undefined;
  }

  "~setStatus"(newStatus: Flow.ExecutionStatus): void {
    if (this._status === newStatus) return;

    this._status = newStatus;

    for (const callback of this.statusCallbacks) {
      Promise.resolve(callback(newStatus, this)).catch((err) => {
        console.error('Error in status change callback:', err);
      });
    }
  }

  "~setCtx"(ctx: Flow.ExecutionData): void {
    this._ctx = ctx;
  }

  onStatusChange(callback: StatusCallback<T>): Core.Cleanup {
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
