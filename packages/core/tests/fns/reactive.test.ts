import { it, expect, describe } from "vitest";
import { reactive } from "../../src/fns/reactive";
import { createScope } from "../../src/core";
import { mutable } from "../../src/fns/mutable";
import { expectEmpty } from "../utils";

describe("reactive test", () => {
  const mutableInt = mutable(() => 1);
  const getLatest = reactive(mutableInt, (value) => () => value.get());

  it("should work", async () => {
    const scope = createScope();

    const fn = (await scope.resolve(getLatest)).get();
    expect(fn()).toBe(1);

    await scope.update(mutableInt, (value) => value + 1);
    expect(fn()).toBe(2);

    const fn2 = await scope.resolve(getLatest);
    expect(fn2.get()).toBe(fn);

    await scope.release(mutableInt);
    await scope.release(getLatest);

    expectEmpty(scope);
  });
});
