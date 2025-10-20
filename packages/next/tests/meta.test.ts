import { describe, test, expect, vi } from "vitest";
import { meta, getValue, findValue, findValues } from "../src/meta";
import { custom, provide, derive, createScope } from "../src";
import { tag } from "../src/tag";

describe("Meta System", () => {
  describe("Basic Meta Operations", () => {
    test("meta definition with validation schema stores and retrieves typed values", async () => {
      const validationFn = vi.fn();

      const nameMeta = meta("name", {
        "~standard": {
          vendor: "test",
          version: 1,
          validate(value) {
            validationFn(0);

            if (typeof value !== "string") {
              validationFn(1);
              return {
                issues: [
                  {
                    message: "must be a string",
                  },
                ],
              };
            }

            validationFn(2);
            return {
              value: value,
            };
          },
        },
      });

      const executor = provide(() => {}, nameMeta("test"));

      expect(getValue(nameMeta("test"))).toBe("test");
      expect(findValue(executor, nameMeta)).toBe("test");
      expect(findValues(executor, nameMeta)).toEqual(["test"]);
    });

    test("meta supports void type for marker metadata", async () => {
      const markerMeta = meta(Symbol(), custom<void>());

      const executor = provide(() => null, markerMeta());

      expect(markerMeta.find(executor), "can void be void?").not.toBeUndefined;
    });
  });

  describe("Meta container support for scope", () => {
    const configMeta = meta("config", custom<string>());
    const debugMeta = meta("debug", custom<string>());

    test("scope stores and provides type-safe access to meta configuration", async () => {
      const scope = createScope({
        meta: [configMeta("production"), debugMeta("off")],
      });

      expect(scope.metas).toBeDefined();
      expect(scope.metas).toHaveLength(2);

      const environmentConfig = configMeta.get(scope);
      expect(environmentConfig).toBe("production");

      const debugMode = debugMeta.get(scope);
      expect(debugMode).toBe("off");
    });

    test("executors access scope meta through controller for configuration injection", async () => {
      const scope = createScope({
        meta: [configMeta("test-env")],
      });

      const environmentAwareExecutor = provide((controller) => {
        const environment = configMeta.get(controller.scope);
        return `Running in ${environment}`;
      });

      const result = await scope.resolve(environmentAwareExecutor);

      expect(result).toBe("Running in test-env");
    });
  });

  describe("Tag Migration Compatibility", () => {
    test("tag replaces meta for basic operations", () => {
      const nameTag = tag(custom<string>(), { label: "name" });
      const nameMeta = meta("name", custom<string>());

      const taggedValue = nameTag("test");
      const executorWithMeta = provide(() => {}, nameMeta("test"));

      expect(taggedValue.value).toBe("test");
      expect(nameTag.find([taggedValue])).toBe("test");
      expect(nameMeta.find(executorWithMeta)).toBe("test");
    });

    test("tag some() replaces meta some()", () => {
      const nameTag = tag(custom<string>(), { label: "name" });
      const nameMeta = meta("name", custom<string>());

      const taggedArray = [nameTag("John"), nameTag("Jane")];
      const metaArray = [nameMeta("John"), nameMeta("Jane")];

      expect(nameTag.some(taggedArray)).toEqual(["John", "Jane"]);
      expect(nameMeta.some(metaArray)).toEqual(["John", "Jane"]);
    });

    test("tag callable replaces meta callable", () => {
      const nameTag = tag(custom<string>());
      const nameMeta = meta("name", custom<string>());

      const taggedValue = nameTag("test");
      const metaValue = nameMeta("test");

      expect(taggedValue.value).toBe("test");
      expect(metaValue.value).toBe("test");
    });
  });
});
