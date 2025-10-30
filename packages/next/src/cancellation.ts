import { type Extension, type Core } from "./types";
import { Promised } from "./promises";
import { AbortError } from "./errors";

export interface CancellationExtension extends Extension.Extension {
  controller: AbortController;
  aborted: boolean;
}

export interface CancellationOptions {
  parentSignal?: AbortSignal;
  timeout?: number;
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

  let parentSignal: AbortSignal | undefined;
  let timeout: number | undefined;

  if (parentSignalOrOptions && typeof parentSignalOrOptions === "object") {
    if ("addEventListener" in parentSignalOrOptions) {
      parentSignal = parentSignalOrOptions as AbortSignal;
    } else {
      const options = parentSignalOrOptions as CancellationOptions;
      parentSignal = options.parentSignal;
      timeout = options.timeout;
    }
  }

  if (parentSignal) {
    parentSignal.addEventListener("abort", () => {
      controller.abort(parentSignal.reason);
      aborted = true;
    });
  }

  controller.signal.addEventListener("abort", () => {
    aborted = true;
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
      if (aborted || controller.signal.aborted) {
        return Promised.create(
          Promise.reject(new AbortError(controller.signal.reason))
        );
      }

      const result = next();

      const cancelablePromise = new Promise<T>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;

        const abortHandler = () => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
          reject(new AbortError(controller.signal.reason));
        };

        controller.signal.addEventListener("abort", abortHandler, {
          once: true,
        });

        if (timeout !== undefined && timeout > 0) {
          timeoutId = setTimeout(() => {
            timedOut = true;
            controller.signal.removeEventListener("abort", abortHandler);
            reject(new AbortError(`Operation timeout after ${timeout}ms`));
          }, timeout);
        }

        result.toPromise().then(
          (value) => {
            if (timeoutId !== undefined) {
              clearTimeout(timeoutId);
            }
            if (timedOut) {
              return;
            }
            controller.signal.removeEventListener("abort", abortHandler);
            if (controller.signal.aborted) {
              reject(new AbortError(controller.signal.reason));
            } else {
              resolve(value);
            }
          },
          (error) => {
            if (timeoutId !== undefined) {
              clearTimeout(timeoutId);
            }
            if (timedOut) {
              return;
            }
            controller.signal.removeEventListener("abort", abortHandler);
            reject(error);
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
