import { Promised } from "./promises";
import { type Flow, type Core } from "./types";

type StatusCallback<T> = (
  status: Flow.ExecutionStatus,
  execution: Flow.FlowExecution<T>
) => void | Promise<void>;

export class FlowExecutionImpl<T> implements Flow.FlowExecution<T> {
  readonly result: Promised<T>;
  readonly id: string;
  readonly flowName: string | undefined;
  readonly abort: AbortController;

  private _status: Flow.ExecutionStatus = 'pending';
  private statusCallbacks = new Set<StatusCallback<T>>();
  private _ctx: Flow.ExecutionData;

  constructor(config: {
    id: string;
    flowName: string | undefined;
    abort: AbortController;
    result: Promised<T>;
    ctx: Flow.ExecutionData;
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

  get ctx(): Flow.ExecutionData {
    return this._ctx;
  }

  setStatus(newStatus: Flow.ExecutionStatus): void {
    if (this._status === newStatus) return;

    this._status = newStatus;

    for (const callback of this.statusCallbacks) {
      Promise.resolve(callback(newStatus, this)).catch((err) => {
        console.error('Error in status change callback:', err);
      });
    }
  }

  onStatusChange(callback: StatusCallback<T>): Core.Cleanup {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }
}
