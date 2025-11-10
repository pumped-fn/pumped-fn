export namespace AbortUtils {
  export type AbortWithTimeout = {
    controller: AbortController;
    timeoutId: ReturnType<typeof setTimeout> | null;
  };
}

export function createAbortWithTimeout(
  timeout?: number,
  parentSignal?: AbortSignal
): AbortUtils.AbortWithTimeout {
  const controller = new AbortController();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (timeout) {
    timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(new Error(`Operation timeout after ${timeout}ms`));
      }
    }, timeout);
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      if (timeoutId) clearTimeout(timeoutId);
      controller.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener("abort", () => {
        if (timeoutId) clearTimeout(timeoutId);
        controller.abort(parentSignal.reason);
      }, { once: true });
    }
  }

  return { controller, timeoutId };
}
