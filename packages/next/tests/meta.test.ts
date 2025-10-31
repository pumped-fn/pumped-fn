import { describe, test, expect, vi } from "vitest";
import { custom, provide, derive, createScope, tag } from "../src";

describe("Meta System", () => {
  describe("Basic Meta Operations", () => {
    test("tag definition with validation schema stores and retrieves typed values", async () => {
      const validationFn = vi.fn();

      const nameTag = tag<string>({
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

      const executor = provide(() => {}, nameTag("test"));

      expect(nameTag("test").value).toBe("test");
      expect(nameTag.readFrom(executor)).toBe("test");
      expect(nameTag.collectFrom(executor)).toEqual(["test"]);
    });

    test("tag supports boolean marker tags", async () => {
      const markerTag = tag(custom<boolean>(), { default: true });

      const executor = provide(() => null, markerTag());

      expect(markerTag.readFrom(executor)).toBe(true);
    });
  });

  describe("Meta container support for scope", () => {
    const configTag = tag(custom<string>(), { label: "config" });
    const debugTag = tag(custom<string>(), { label: "debug" });

    test("scope stores and provides type-safe access to meta configuration", async () => {
      const scope = createScope({
        tags: [configTag("production"), debugTag("off")],
      });

      expect(scope.tags).toBeDefined();
      expect(scope.tags).toHaveLength(2);

      const environmentConfig = configTag.extractFrom(scope);
      expect(environmentConfig).toBe("production");

      const debugMode = debugTag.extractFrom(scope);
      expect(debugMode).toBe("off");
    });

    test("executors access scope meta through controller for configuration injection", async () => {
      const scope = createScope({
        tags: [configTag("test-env")],
      });

      const environmentAwareExecutor = provide((controller) => {
        const environment = configTag.extractFrom(controller.scope);
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
      expect(nameTag.readFrom([taggedValue])).toBe("test");
      expect(nameTag.readFrom(executor)).toBe("test");
    });

    test("tag some() collects multiple values", () => {
      const nameTag = tag(custom<string>(), { label: "name" });

      const taggedArray = [nameTag("John"), nameTag("Jane")];

      expect(nameTag.collectFrom(taggedArray)).toEqual(["John", "Jane"]);
    });

    test("tag callable creates tagged values", () => {
      const nameTag = tag(custom<string>());

      const taggedValue = nameTag("test");

      expect(taggedValue.value).toBe("test");
    });
  });
});
