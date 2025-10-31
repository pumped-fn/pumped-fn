import { type Extension, type Core } from "./types";
import { Promised } from "./promises";
import { AbortError } from "./errors";

export interface CancellationExtension extends Extension.Extension {
  controller: AbortController;
  aborted: boolean;
}

export interface CancellationOptions {
  parentSignal?: AbortSignal;
  deadline?: number;
}

export function createCancellationExtension(
  parentSignal?: AbortSignal
): CancellationExtension;

export function createCancellationExtension(
  options?: CancellationOptions
): CancellationExtension;

export function createCancellationExtension(
  parentSignalOrOptions?: AbortSignal | CancellationOptions
): CancellationExtension {
  const controller = new AbortController();
  let aborted = false;
  let deadlineExceeded = false;

  let parentSignal: AbortSignal | undefined;
  let deadline: number | undefined;

  if (parentSignalOrOptions && typeof parentSignalOrOptions === "object") {
    if ("addEventListener" in parentSignalOrOptions) {
      parentSignal = parentSignalOrOptions as AbortSignal;
    } else {
      const options = parentSignalOrOptions as CancellationOptions;
      parentSignal = options.parentSignal;
      deadline = options.deadline;
    }
  }

  if (parentSignal) {
    parentSignal.addEventListener("abort", () => {
      controller.abort(parentSignal.reason);
      aborted = true;
      if (deadline !== undefined && deadline > 0) {
        setTimeout(() => {
          deadlineExceeded = true;
        }, deadline);
      }
    });
  }

  controller.signal.addEventListener("abort", () => {
    aborted = true;
    if (deadline !== undefined && deadline > 0) {
      setTimeout(() => {
        deadlineExceeded = true;
      }, deadline);
    }
  });

  return {
    name: "cancellation",
    controller,
    get aborted() {
      return aborted;
    },

    wrap<T>(
      _scope: Core.Scope,
      next: () => Promised<T>,
      _operation: Extension.Operation
    ): Promised<T> {
      const hasDeadline = deadline !== undefined && deadline > 0;
      const isAlreadyAborted = aborted || controller.signal.aborted;

      if (isAlreadyAborted) {
        if (deadlineExceeded) {
          return Promised.create(
            Promise.reject(new AbortError("Deadline exceeded"))
          );
        }
        if (!hasDeadline) {
          return Promised.create(
            Promise.reject(new AbortError(controller.signal.reason))
          );
        }
      }

      const result = next();

      const cancelablePromise = new Promise<T>((resolve, reject) => {
        let abortHandler: (() => void) | null = null;
        let deadlineTimer: any = null;
        let settled = false;

        const cleanup = () => {
          if (abortHandler) {
            controller.signal.removeEventListener("abort", abortHandler);
          }
          if (deadlineTimer) {
            clearTimeout(deadlineTimer);
          }
        };

        abortHandler = () => {
          if (hasDeadline) {
            deadlineTimer = setTimeout(() => {
              if (!settled) {
                cleanup();
                settled = true;
                reject(new AbortError("Deadline exceeded"));
              }
            }, deadline);
          }
        };

        if (isAlreadyAborted && hasDeadline && !deadlineExceeded) {
          abortHandler();
        } else if (!isAlreadyAborted) {
          controller.signal.addEventListener("abort", abortHandler, {
            once: true,
          });
        }

        result.toPromise().then(
          (value) => {
            if (!settled) {
              cleanup();
              settled = true;
              resolve(value);
            }
          },
          (error) => {
            if (!settled) {
              cleanup();
              settled = true;
              reject(error);
            }
          }
        );
      });

      return Promised.create(cancelablePromise);
    },

    dispose(_scope: Core.Scope): void {
      if (!aborted && !controller.signal.aborted) {
        controller.abort("Scope disposed");
        aborted = true;
      }
    },
  };
}
