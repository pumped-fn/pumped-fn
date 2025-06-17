import { createScope, provide } from "../src";
import { resolves } from "../src/helpers";
import { expect, test } from "vitest";

test("helpers resolves", async () => {
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
