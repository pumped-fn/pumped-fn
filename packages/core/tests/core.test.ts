import { describe, it, expect } from "vitest";
import { createScope, resolveOnce, safeResolve } from "../src/index";

import { provide } from "../src/fns/immutable";
import { effect } from "../src/fns/effect";
import { mutable } from "../src/fns/mutable";
import { resource } from "../src/fns/resource";

describe("core", () => {
  const stringValue = mutable(async () => "hello");
  const numberValue = provide(() => 1);
  const someEffect = effect([stringValue], ([str]) => () => {});
  const someResource = resource(stringValue, () => [1, () => {}]);

  const combinedObject = provide({ stringValue, numberValue }, async ({ stringValue, numberValue }) => {
    return { stringValue: stringValue, numberValue: numberValue };
  });

  const combinedArray = provide([stringValue, numberValue], async ([stringValue, numberValue]) => {
    return [stringValue, numberValue];
  });

  it("syntax", async () => {
    const scope = createScope();

    expect(await resolveOnce(scope, stringValue)).toBe("hello");
    expect(await resolveOnce(scope, numberValue)).toBe(1);
    expect(await resolveOnce(scope, someResource)).toBe(1);
    expect(await resolveOnce(scope, combinedObject)).toEqual({ stringValue: "hello", numberValue: 1 });
    expect(await resolveOnce(scope, combinedArray)).toEqual(["hello", 1]);
  });
});
