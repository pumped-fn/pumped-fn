import { describe, expect, it, test, vi } from "vitest";
import {
  provide,
  mutable,
  effect,
  resource,
  createScope,
  resolve,
  resolveOnce,
  run,
  safeResolve,
  value,
  reduce,
  mvalue,
} from "../src";

describe("various static functions", () => {
  const strValue = provide(() => "hello");
  const mutableStrValue = mutable(() => 20);

  const combined = provide([strValue, mutableStrValue], async ([strValue, mutableStrValue]) => {
    return { strValue, mutableStrValue };
  });

  const theEffect = effect([strValue, mutableStrValue], async ([strValue, mutableStrValue]) => {
    return () => {};
  });

  const theResource = resource({ strValue, mutableStrValue }, async ({ strValue, mutableStrValue }) => {
    return [strValue + " " + mutableStrValue, () => {}];
  });

  it("static fn should work", async () => {
    const scope = createScope();

    expect(
      await resolve(scope, [strValue, mutableStrValue, theResource]).then(([v1, v2, v3]) => [
        v1.get(),
        v2.get(),
        v3.get(),
      ]),
    ).toEqual(["hello", 20, "hello 20"]);

    expect(await resolveOnce(scope, [strValue, mutableStrValue])).toEqual(["hello", 20]);

    expect(
      await run(scope, [strValue, mutableStrValue], ([strValue, mutableStrValue]) => {
        return strValue + " " + mutableStrValue;
      }),
    ).toEqual("hello 20");

    expect(
      await safeResolve(scope, [strValue, mutableStrValue]).then((r) => {
        if (r.status === "ok") {
          const [v1, v2] = r.value;
          return [v1.get(), v2.get()];
        }
        throw r.error;
      }),
    ).toEqual(["hello", 20]);

    expect(
      await safeResolve(scope, [strValue, mutableStrValue, theResource]).then((r) => {
        if (r.status === "ok") {
          const [v1, v2, v3] = r.value;
          return [v1.get(), v2.get(), v3.get()];
        }
        throw r.error;
      }),
    ).toEqual(["hello", 20, "hello 20"]);
  });

  it("reduce should work", async () => {
    const scope = createScope();

    const mutableValue = mvalue(0);
    const number1 = provide(mutableValue, (m) => m + 1);
    const number2 = value(2);
    const number3 = resource(number1, (number1) => [number1 + 1, () => {}]);

    const grouped = reduce(
      [number1, number2, number3],
      (acc, current) => {
        return acc + current;
      },
      value(0),
    );

    const v = await resolve(scope, grouped);
    expect(v.get()).toBe(5);

    await scope.update(mutableValue, 2);
    expect(v.get()).toBe(9);

    await scope.dispose();
  });
});
