import { test, expect } from "vitest";
import { anyCreate } from "../../src/fns/_internal";
import { executorSymbol, meta, StandardSchemaV1 } from "../../src";

function castAny(): StandardSchemaV1<any> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate(value: any) {
        return value;
      },
    },
  };
}

test("anyCreate test", () => {
  const fn = () => {};

  const value = anyCreate({ kind: "immutable" }, "1", fn);

  const directDerive = anyCreate(
    {
      kind: "reactive-resource",
    },
    "2",
    value,
    fn,
    meta("direct", castAny())(""),
  );

  const arrayDerive = anyCreate(
    {
      kind: "execution",
    },
    "3",
    [value],
    fn,
    meta("array", castAny())([]),
  );

  const objectDerive = anyCreate(
    {
      kind: "execution",
    },
    "4",
    { value },
    fn,
    meta("object", castAny())({}),
  );

  expect(value[executorSymbol]).toEqual({ kind: "immutable" });
  expect(value.dependencies).toBeUndefined();
  expect(value.metas?.length).toBe(0);

  expect(directDerive[executorSymbol]).toEqual({ kind: "reactive-resource" });
  expect(directDerive.dependencies).toEqual(value);
  expect(directDerive.metas?.[0].key).toBe("direct");

  expect(arrayDerive[executorSymbol]).toEqual({ kind: "execution" });
  expect(arrayDerive["dependencies"]).toEqual([value]);
  expect(arrayDerive["metas"]?.[0]["key"]).toBe("array");
  expect(objectDerive[executorSymbol]).toEqual({ kind: "execution" });
  expect(objectDerive["dependencies"]).toEqual({ value });
  expect(objectDerive["metas"]?.[0]["key"]).toBe("object");
});
