import { it, expect, describe } from "vitest";
import { resolve, resolveOnce } from "../../src/statics";
import { createScope, ScopeInner } from "../../src/core";
import { mutable } from "../../src/fns/mutable";
import { provide } from "../../src/fns/immutable";
import { expectEmpty } from "../utils";

describe("ref test", () => {
  const mutableInt = mutable(() => 1);
  const updator = provide([mutableInt.ref], ([ref], scope) => {
    return (value: number) => scope.update(ref, value);
  });

  const updator2 = provide(mutableInt.ref, async (ref, scope) => {
    return (value: number) => scope.update(ref, value);
  });

  it("should work", async () => {
    const scope = createScope();

    const inner = scope as unknown as ScopeInner;

    const val = await resolve(scope, mutableInt);
    expect(val.get()).toBe(1);

    const updatorAPI = await resolveOnce(scope, updator);
    await updatorAPI(2);
    expect(val.get()).toBe(2);

    const updatorAPI2 = await resolveOnce(scope, updator2);
    await updatorAPI2(3);
    expect(val.get()).toBe(3);

    expect(inner.getValues().size).toBe(4);

    await scope.release(mutableInt);
    expectEmpty(scope);
  });
});
