import { it, expect, describe, vi, beforeEach } from "vitest";
import { resource } from "../../src/fns/resource";
import { createScope } from "../../src/core";
import { mutable } from "../../src/fns/mutable";
import { expectEmpty } from "../utils";

describe("resource test", () => {
  const mutableInt = mutable(() => 1);
  const fn = vi.fn();
  const theResource = resource(mutableInt, (value) => [value, () => fn()]);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should work", async () => {
    const scope = createScope();

    const resolved = await scope.resolve(theResource);
    expect(resolved.get()).toBe(1);
    expect(fn).not.toHaveBeenCalled();

    await scope.update(mutableInt, (value) => value + 1);
    expect(resolved.get()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);

    await scope.release(theResource);
    expect(fn).toHaveBeenCalledTimes(2);

    await scope.release(mutableInt);

    expectEmpty(scope);
  });
});
