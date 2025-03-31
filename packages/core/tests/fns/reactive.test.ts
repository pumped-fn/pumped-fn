import { it, expect, describe } from "vitest";
import { reactive, reactiveResource } from "../../src/fns/reactive";
import { resource } from "../../src/fns/resource";
import { createScope } from "../../src/core";
import { mutable } from "../../src/fns/mutable";
import { expectEmpty } from "../utils";

describe("reactive test", () => {
  const mutableInt = mutable(() => 1);
  const derivedResource = resource(mutableInt, (value) => [value, () => {}]);
  const getLatest = reactive(mutableInt, (value) => () => value.get());
  const derivedReactiveResource = reactiveResource(mutableInt, (mutableInt) => [mutableInt.get(), () => {}]);

  it("should work", async () => {
    const scope = createScope();

    const fn = (await scope.resolve(getLatest)).get();
    expect(fn()).toBe(1);

    await scope.update(mutableInt, (value) => value + 1);
    expect(fn()).toBe(2);

    const fn2 = await scope.resolve(getLatest);
    expect(fn2.get()).toBe(fn);

    const resolved = await scope.resolve(derivedReactiveResource);
    expect(resolved.get()).toEqual(2);

    await scope.release(mutableInt);
    await scope.release(getLatest);
    await scope.release(derivedReactiveResource);

    expectEmpty(scope);
  });
});
