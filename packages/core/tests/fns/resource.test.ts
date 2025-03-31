import { it, expect, describe, vi, beforeEach } from "vitest";
import { resource } from "../../src/fns/resource";
import { createScope } from "../../src/core";
import { mutable } from "../../src/fns/mutable";
import { expectEmpty } from "../utils";

describe("resource test", () => {
  const mutableInt = mutable(() => 1);
  const fn = vi.fn();
  const fn2 = vi.fn();

  const theResource = resource(mutableInt, (value) => [value, fn]);
  const derivedResource = resource(theResource, (value) => [value, fn2]);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should work", async () => {
    const scope = createScope();

    const resolved = await scope.resolve(theResource);
    const resolved2 = await scope.resolve(derivedResource);

    expect(resolved.get()).toBe(1);
    expect(fn).not.toHaveBeenCalled();

    expect(resolved2.get()).toEqual(1);

    await scope.update(mutableInt, (value) => value + 1);
    expect(resolved.get()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);

    await scope.release(theResource);
    expect(fn).toHaveBeenCalledTimes(2);

    await scope.release(mutableInt);
    expectEmpty(scope);
    await scope.dispose();
    expect(fn2).toHaveBeenCalledTimes(2);
  });
});
