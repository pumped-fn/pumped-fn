import { type Extension, type Core } from "./types";
import { Promised } from "./promises";
import { AbortError } from "./errors";

export interface CancellationExtension extends Extension.Extension {
  controller: AbortController;
  aborted: boolean;
}

export function createCancellationExtension(
  parentSignal?: AbortSignal
): CancellationExtension {
  const controller = new AbortController();
  let aborted = false;

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
        const abortHandler = () => {
          reject(new AbortError(controller.signal.reason));
        };

        controller.signal.addEventListener("abort", abortHandler, {
          once: true,
        });

        result.toPromise().then(
          (value) => {
            controller.signal.removeEventListener("abort", abortHandler);
            if (controller.signal.aborted) {
              reject(new AbortError(controller.signal.reason));
            } else {
              resolve(value);
            }
          },
          (error) => {
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
