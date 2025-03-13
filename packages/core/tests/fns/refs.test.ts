import { it, expect, describe } from "vitest";
import { ref } from "../../src/fns/ref";
import { resolve, resolveOnce } from "../../src/statics";
import { createScope, ScopeInner } from "../../src/core";
import { mutable } from "../../src/fns/mutable";
import { provide } from "../../src/fns/immutable";

describe("ref test", () => {
  const mutableInt = mutable(() => 1);
  const updator = provide([ref(mutableInt)], ([ref], scope) => {
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

    await scope.release(mutableInt);
  });
});
