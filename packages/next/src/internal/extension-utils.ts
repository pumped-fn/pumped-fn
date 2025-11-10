import { type Extension, type Core } from "../types";
import { Promised } from "../promises";

export function wrapWithExtensions<T>(
  extensions: Extension.Extension[] | undefined,
  baseExecutor: () => Promised<T>,
  scope: Core.Scope,
  operation: Extension.Operation
): () => Promised<T> {
  if (!extensions || extensions.length === 0) {
    return baseExecutor;
  }
  let executor = baseExecutor;
  for (let i = extensions.length - 1; i >= 0; i--) {
    const extension = extensions[i];
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!(scope, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}
