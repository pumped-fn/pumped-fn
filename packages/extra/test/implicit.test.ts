import { test, expect } from "vitest";
import { createScope, derive, preset, provide } from "@pumped-fn/core-next";
import { adapt, run } from "../src/implicit";

test("implicit store", async () => {
  const a = provide(() => "A");
  const b = derive(a, (a) => a + "B");

  const k = (i: (x: string) => Promise<{ result: string }>) => i("C");

  const preparedB = () =>
    k(
      adapt({ b }, async ({ b }, c: string) => {
        return { result: b + c };
      })
    );

  const scope1 = createScope();
  const scope2 = createScope(preset(a, "A1"));

  await run(scope1, async () => {
    const result = await preparedB();
    expect(result).toEqual({ result: "ABC" });
  });

  await run(scope2, async () => {
    const result = await preparedB();
    expect(result).toEqual({ result: "A1BC" });
  });
});
