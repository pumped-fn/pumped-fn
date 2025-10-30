import { type Extension } from "./types";

export interface CancellationExtension extends Extension.Extension {
  controller: AbortController;
}

export function createCancellationExtension(
  parentSignal?: AbortSignal
): CancellationExtension {
  const controller = new AbortController();

  if (parentSignal) {
    parentSignal.addEventListener("abort", () => {
      controller.abort(parentSignal.reason);
    });
  }

  return {
    name: "cancellation",
    controller,
  };
}
