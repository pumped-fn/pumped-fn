import { describe, test, expect, vi } from "vitest";
import { meta, getValue, findValue, findValues } from "../src/meta";
import { custom, provide, derive, createScope } from "../src";

describe("Meta System", () => {
  describe("Basic Meta Operations", () => {
    test("basic meta functionality", async () => {
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

    test("meta should work with void as well", async () => {
      const voidMeta = meta(Symbol(), custom<void>());
      const e = provide(() => null, voidMeta());

      expect(voidMeta.find(e), "can void be void?").not.toBeUndefined;
    });
  });

  describe("Meta container support for scope", () => {
    const configMeta = meta("config", custom<string>());
    const debugMeta = meta("debug", custom<string>());

    test("scope should implement Meta.MetaContainer", async () => {
      const scope = createScope({
        meta: [configMeta("production"), debugMeta("off")]
      });

      expect(scope.metas).toBeDefined();
      expect(scope.metas).toHaveLength(2);

      const config = configMeta.get(scope);
      expect(config).toBe("production");

      const debug = debugMeta.get(scope);
      expect(debug).toBe("off");
    });

    test("executors can access scope meta through controller", async () => {
      const scope = createScope({
        meta: [configMeta("test-env")]
      });

      const configExecutor = provide((ctl) => {
        const config = configMeta.get(ctl.scope);
        return `Running in ${config}`;
      });

      const result = await scope.resolve(configExecutor);
      expect(result).toBe("Running in test-env");
    });
  });
});
