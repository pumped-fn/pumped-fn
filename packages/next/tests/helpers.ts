import { createScope } from "../src/scope";
import type { Core } from "../src/types";

export async function withScope<T>(
  fn: (scope: Core.Scope) => T | Promise<T>
): Promise<T> {
  const scope = createScope();
  try {
    return await fn(scope);
  } finally {
    await scope.dispose();
  }
}

