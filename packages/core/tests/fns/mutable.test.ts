import { it, expect, describe } from "vitest";
import { mutable } from "../../src/fns/mutable";
import { createScope } from "../../src/core";
import { provide } from "../../src/fns/immutable";
import { expectEmpty } from "../utils";

describe("mutable test", () => {
  const mutableValue = mutable(() => 1);
  const derivedValue = provide([mutableValue], async ([value]) => value + 1);

  const derivedMutable = mutable(derivedValue, (value) => value + 1);

  it("should work", async () => {
    const scope = createScope();

    expect((await scope.resolve(mutableValue)).get()).toBe(1);
    expect((await scope.resolve(derivedValue)).get()).toBe(2);
    expect((await scope.resolve(derivedMutable)).get()).toBe(3);

    await scope.update(mutableValue, (value) => value + 1);

    expect((await scope.resolve(mutableValue)).get()).toBe(2);
    expect((await scope.resolve(derivedValue)).get()).toBe(3);

    expect((await scope.resolve(derivedMutable)).get()).toBe(4);

    await scope.release(mutableValue);
    expectEmpty(scope);
  });
});
