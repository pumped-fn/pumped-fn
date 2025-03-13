import { it, expect, describe } from "vitest";
import { mutable } from "../../src/fns/mutable";
import { createScope } from "../../src/core";
import { provide } from "../../src/fns/immutable";

describe("mutable test", () => {
  const mutableValue = mutable(() => 1);
  const derivedValue = provide([mutableValue], ([value]) => value + 1);

  it("should work", async () => {
    const scope = createScope();

    expect((await scope.resolve(mutableValue)).get()).toBe(1);
    expect((await scope.resolve(derivedValue)).get()).toBe(2);

    await scope.update(mutableValue, (value) => value + 1);

    expect((await scope.resolve(mutableValue)).get()).toBe(2);
    expect((await scope.resolve(derivedValue)).get()).toBe(3);
  });
});
