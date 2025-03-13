import { it, expect, describe, vi, beforeEach } from "vitest";
import { effect } from "../../src/fns/effect";
import { createScope } from "../../src/core";
import { mutable } from "../../src/fns/mutable";

describe("effect test", () => {
  const mutableInt = mutable(() => 1);
  const fn = vi.fn();
  const theResource = effect(mutableInt, (value) => fn);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should work", async () => {
    const scope = createScope();

    await scope.resolve(theResource);
    expect(fn).not.toHaveBeenCalled();

    await scope.update(mutableInt, (value) => value + 1);
    expect(fn).toHaveBeenCalledTimes(1);

    await scope.release(theResource);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
