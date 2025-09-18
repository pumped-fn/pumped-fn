import { describe, expect, test } from "vitest";
import { createScope, plugin, preset, provide, name } from "../src";

describe("lifecycle test", async () => {
  test("explains how middleware works", async () => {
    const scope = createScope();

    let resolveCount = 0;
    let updateCount = 0;
    let releaseCount = 0;

    const value = provide(() => "Hello, World!");
    const anotherValue = provide(() => "Hello, World!");

    const analysisCount = () => {
      return plugin({
        init: (_scope) => {
          scope.onChange((event, executor, value) => {
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

          scope.onRelease((event, _executor) => {
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

  test("wrap methods work correctly", async () => {
    const scope = createScope();

    const mockCalls: Array<{
      method: string;
      executor: string;
      context: any;
      timing: "before" | "after";
    }> = [];

    const value1 = provide(() => "value1", name("executor1"));
    const value2 = provide(() => "value2", name("executor2"));

    const wrapPlugin = plugin({
      async wrap(next, context) {
        const executorName = name.find(context.executor) || "unnamed";
        mockCalls.push({
          method: "wrap",
          executor: executorName,
          context: {
            operation: context.operation,
          },
          timing: "before",
        });

        const result = await next();

        mockCalls.push({
          method: "wrap",
          executor: executorName,
          context: {
            operation: context.operation,
          },
          timing: "after",
        });

        return result;
      },
    });

    scope.use(wrapPlugin);

    // Test resolve wrap
    const result1 = await scope.resolve(value1);
    expect(result1).toBe("value1");
    expect(
      mockCalls.filter(
        (c) =>
          c.method === "wrap" &&
          c.executor === "executor1" &&
          c.context.operation === "resolve"
      )
    ).toHaveLength(2);

    // Test forced resolve wrap
    const result2 = await scope.resolve(value1, true);
    expect(result2).toBe("value1");

    // Test update wrap
    await scope.update(value1, "updated");
    expect(
      mockCalls.filter(
        (c) => c.method === "wrap" && c.context.operation === "update"
      )
    ).toHaveLength(2);

    // Test update wrap with function
    await scope.update(value1, (current) => current + " more");

    // Test release (no wrapping for release operations)
    await scope.resolve(value2);
    await scope.release(value2);
    expect(
      mockCalls.filter((c) => c.method === "wrap" && c.executor === "executor2")
    ).toHaveLength(2); // Only resolve wrap

    // Verify order: all 'before' calls come before their corresponding 'after' calls
    const wraps = mockCalls.filter((c) => c.method === "wrap");
    for (let i = 0; i < wraps.length; i += 2) {
      expect(wraps[i].timing).toBe("before");
      expect(wraps[i + 1].timing).toBe("after");
    }
  });

  test("multiple wrap plugins compose correctly", async () => {
    const scope = createScope();
    const executionOrder: string[] = [];

    const value = provide(() => "test");

    const plugin1 = plugin({
      async wrap(next, _context) {
        executionOrder.push("plugin1-before");
        const result = await next();
        executionOrder.push("plugin1-after");
        return result;
      },
    });

    const plugin2 = plugin({
      async wrap(next, _context) {
        executionOrder.push("plugin2-before");
        const result = await next();
        executionOrder.push("plugin2-after");
        return result;
      },
    });

    scope.use(plugin1);
    scope.use(plugin2);

    await scope.resolve(value);

    // Plugins execute in the order they were added
    expect(executionOrder).toEqual([
      "plugin1-before",
      "plugin2-before",
      "plugin2-after",
      "plugin1-after",
    ]);
  });

  test("wrap methods can modify behavior", async () => {
    const scope = createScope();

    const value = provide(() => "original");

    const modifyingPlugin = plugin({
      async wrap(next, _context): Promise<unknown> {
        const result = await next();
        return (result + "-modified") as unknown;
      },
    });

    scope.use(modifyingPlugin);

    const result = await scope.resolve(value);
    expect(result).toBe("original-modified");

    await scope.update(value, "new-value");
    const updatedResult = await scope.resolve(value);
    expect(updatedResult).toBe("new-value-modified");
  });
});
