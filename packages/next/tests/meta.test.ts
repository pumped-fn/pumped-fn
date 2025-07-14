import { vi, test, expect } from "vitest";
import { meta, getValue, findValue, findValues } from "../src/meta";
import { custom, provide } from "../src";

test("basic", async () => {
  const fn = vi.fn();
  const name = meta("name", {
    "~standard": {
      vendor: "test",
      version: 1,
      validate(value) {
        fn(0);
        if (typeof value !== "string") {
          fn(1);
          return {
            issues: [
              {
                message: "must be a string",
              },
            ],
          };
        }

        fn(2);
        return {
          value: value,
        };
      },
    },
  });

  const e = provide(() => {}, name("test"));

  expect(getValue(name("test"))).toBe("test");
  expect(findValue(e, name)).toBe("test");
  expect(findValues(e, name)).toEqual(["test"]);
});
