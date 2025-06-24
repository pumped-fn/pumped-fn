import { createScope, derive, preset, provide } from "../src";
import { adapt, prepare, resolves } from "../src/helpers";
import { expect, test } from "vitest";

test("resolves helper", async () => {
  const scope = createScope();

  const a = provide(() => "A");
  const b = provide(() => "B");
  const c = provide(() => "C");

  const obj = {
    a,
    b,
    c,
  };

  const arr = [a, b];

  const result = await resolves(scope, obj);

  expect(result).toEqual({
    a: "A",
    b: "B",
    c: "C",
  });

  const result2 = await resolves(scope, arr);
  expect(result2).toEqual(["A", "B"]);
});

test("prepared and adapted helper", async () => {
  const scope = createScope();

  const a = provide(() => "A");
  const b = derive(a, (a) => a + "B");
  const c = derive(b, (b) => (x: string) => b + x);

  const preparedA = prepare(scope, a);
  const preparedB = prepare(scope, b);
  const adapatedC = adapt(scope, c);

  expect(await preparedA()).toBe("A");
  expect(preparedA.escape()).toBe(a);
  expect(await preparedB()).toBe("AB");
  expect(await adapatedC("C")).toBe("ABC");

  const presetA = preset(preparedA, "C");
  const anotherScope = createScope(presetA);

  const [resovledB, resolvedAdaptedC] = await resolves(anotherScope, [
    preparedB,
    adapatedC,
  ]);
  expect(resovledB).toBe("CB");
  expect(await resolvedAdaptedC("D")).toBe("CBD");
});
