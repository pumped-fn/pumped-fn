import { describe, it, expect, test } from "vitest";
import { createScope, middleware, preset, provide } from "../src";

describe("lifecycle test", async () => {
  test("explains how middleware works", async () => {
    const scope = createScope();

    let resolveCount = 0;
    let updateCount = 0;
    let releaseCount = 0;

    const value = provide(() => "Hello, World!");
    const anotherValue = provide(() => "Hello, World!");

    const analysisCount = () => {
      return middleware({
        init: (scope) => {
          scope.onChange((event, executor, value, scope) => {
            if (event === "resolve") {
              resolveCount++;
            }

            if (event === "update") {
              updateCount++;
            }

            if (value === "unchangable") {
              return preset(executor, "changed");
            }
          });

          scope.onRelease((event, executor, scope) => {
            if (event === "release") {
              releaseCount++;
            }
          });
        },
      });
    };

    const cleanup = scope.use(analysisCount());

    await scope.resolve(value);
    expect(resolveCount).toBe(1);
    expect(updateCount).toBe(0);

    await scope.update(value, (current) => current + " Updated");
    expect(resolveCount).toBe(1);
    expect(updateCount).toBe(1);

    await scope.update(value, "unchangable");
    expect(resolveCount).toBe(1);
    expect(updateCount).toBe(2);

    const result = await scope.resolve(value);
    expect(result).toBe("changed");
    expect(resolveCount).toBe(1);
    expect(updateCount).toBe(2);

    cleanup();

    await scope.resolve(anotherValue);
    expect(resolveCount).toBe(2);
    expect(updateCount).toBe(2);
  });
});
