import { describe, test, expect, vi } from "vitest";
import { custom, provide, derive, createScope, tag } from "../src";

describe("Meta System", () => {
  describe("Basic Meta Operations", () => {
    test("meta definition with validation schema stores and retrieves typed values", async () => {
      const validationFn = vi.fn();

      const nameMeta = tag<string>({
        "~standard": {
          vendor: "test",
          version: 1,
          validate(value: unknown) {
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
      }, { label: "name" });

      const executor = provide(() => {}, nameMeta("test"));

      expect(nameMeta("test").value).toBe("test");
      expect(nameMeta.find(executor)).toBe("test");
      expect(nameMeta.some(executor)).toEqual(["test"]);
    });

    test("tag supports boolean marker metadata", async () => {
      const markerMeta = tag(custom<boolean>(), { default: true });

      const executor = provide(() => null, markerMeta());

      expect(markerMeta.find(executor)).toBe(true);
    });
  });

  describe("Meta container support for scope", () => {
    const configMeta = tag(custom<string>(), { label: "config" });
    const debugMeta = tag(custom<string>(), { label: "debug" });

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

  describe("Tag API", () => {
    test("tag basic operations", () => {
      const nameTag = tag(custom<string>(), { label: "name" });

      const taggedValue = nameTag("test");
      const executor = provide(() => {}, nameTag("test"));

      expect(taggedValue.value).toBe("test");
      expect(nameTag.find([taggedValue])).toBe("test");
      expect(nameTag.find(executor)).toBe("test");
    });

    test("tag some() collects multiple values", () => {
      const nameTag = tag(custom<string>(), { label: "name" });

      const taggedArray = [nameTag("John"), nameTag("Jane")];

      expect(nameTag.some(taggedArray)).toEqual(["John", "Jane"]);
    });

    test("tag callable creates tagged values", () => {
      const nameTag = tag(custom<string>());

      const taggedValue = nameTag("test");

      expect(taggedValue.value).toBe("test");
    });
  });
});
