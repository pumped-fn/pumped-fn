import { vi, describe, it, expect, test, beforeEach } from "vitest";
import { createScope, provide, derive, meta, custom } from "../src";
import { flow } from "../src";

describe("pod scope", () => {
  const valueFn = vi.fn();
  const factoredFn = vi.fn();

  const value = provide(() => {
    valueFn("first");
    return 1;
  });

  const derived = derive(value, (v) => v + 1);
  const factored = provide(() => {
    factoredFn("factored");
    return 2;
  });

  const subFlow = flow.derive(
    {
      dependencies: [derived],
      input: custom<number>(),
      output: custom<number>(),
    },
    async ([derived], input) => {
      return input + derived;
    }
  );

  const mainFlow = flow.derive(
    {
      dependencies: [subFlow, factored],
      input: custom<number>(),
      output: custom<number>(),
    },
    async ([subFlow, factored], input, ctl) => {
      return await ctl.execute(subFlow, input * factored);
    }
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  test("scope is isolated till it's resolved for the first time", async () => {
    let result = await flow.execute(mainFlow, 3);
    expect(result.result).toEqual({ kind: "success", value: 8 });

    result = await flow.execute(mainFlow, 3);

    expect(valueFn).toHaveBeenCalledTimes(2);
    expect(factoredFn).toHaveBeenCalledTimes(2);
  });

  test("value will be shared if it's already resolved", async () => {
    const scope = createScope();

    await scope.resolve(derived);

    let result = await flow.execute(mainFlow, 3, { scope });
    expect(result.result).toEqual({ kind: "success", value: 8 });
    expect(valueFn).toHaveBeenCalledTimes(1);
    expect(factoredFn).toHaveBeenCalledTimes(1);

    result = await flow.execute(mainFlow, 3, { scope });
    expect(result.result).toEqual({ kind: "success", value: 8 });
    expect(valueFn).toHaveBeenCalledTimes(1);
    expect(factoredFn).toHaveBeenCalledTimes(2);
  });
});
