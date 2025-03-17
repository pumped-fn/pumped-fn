import { Scope } from "packages/core/src";
import { ScopeInner } from "packages/core/src/core";
import { expect } from "vitest";

export function expectEmpty(scope: Scope) {
  const inner = scope as unknown as ScopeInner;

  expect(inner.getCleanups().size).toBe(0);
  expect(inner.getDependencyMap().size).toBe(0);
  expect(inner.getValues().size).toBe(0);
}
