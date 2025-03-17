import { it, expect, describe } from "vitest";
import { provide } from "../../src/fns/immutable";
import { createScope } from "../../src/core";
import { expectEmpty } from "../utils";

describe("immutable test", () => {
  const immutableValue = provide(() => 1);
  const immutableDerived = provide(immutableValue, (value) => value + 1);
  const immutableCombinedArrayDerived = provide(
    [immutableValue, immutableDerived],
    ([value, derived]) => value + derived,
  );
  const immutableCombinedObjectDerived = provide(
    { value: immutableValue, derived: immutableDerived },
    ({ value, derived }) => value + derived,
  );

  it("should work", async () => {
    const scope = createScope();

    expect((await scope.resolve(immutableValue)).get()).toBe(1);
    expect((await scope.resolve(immutableDerived)).get()).toBe(2);
    expect((await scope.resolve(immutableCombinedArrayDerived)).get()).toBe(3);
    expect((await scope.resolve(immutableCombinedObjectDerived)).get()).toBe(3);

    await scope.release(immutableValue);

    expectEmpty(scope);
  });

  it("should not be able to update", async () => {
    const scope = createScope();

    await scope.resolve(immutableValue);
    expect(() => scope.update(immutableValue as any, (value) => value)).rejects.toThrow();

    await scope.release(immutableValue);
    expectEmpty(scope);
  });
});
