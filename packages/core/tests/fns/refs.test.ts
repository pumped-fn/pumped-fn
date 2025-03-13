import { it, expect, describe } from "vitest";
import { ref } from "../../src/fns/ref";
import { createScope, ScopeInner } from "../../src/core";
import { mutable } from "../../src/fns/mutable";

describe("ref test", () => {
  const mutableInt = mutable(() => 1);
  const getLatest = ref(mutableInt);

  it("should work", async () => {
    const scope = createScope();

    const inner = scope as unknown as ScopeInner;

    await scope.resolve(getLatest);

    expect(inner.getValues().has(mutableInt)).toBe(true);
    expect(inner.getValues().size).toBe(1);
    await scope.release(mutableInt);

    expect(inner.getValues().size).toBe(0);
  });
});
