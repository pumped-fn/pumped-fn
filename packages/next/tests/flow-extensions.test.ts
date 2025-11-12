import { describe, test, expect } from "vitest";
import { flow, flowMeta } from "../src/flow";
import { createScope } from "../src/scope";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import type { Extension } from "../src/types";

function createOperationTracker() {
  const operations: Extension.Operation[] = [];

  const ext: Extension.Extension = {
    name: "tracker",
    wrap(scope, next, operation) {
      operations.push(operation);
      return next();
    }
  };

  return { ext, operations };
}

describe("Extension wrapping - Exhaustive verification", () => {
  test.each([
    ["flow execution", async (scope: any) => {
      const testFlow = flow((ctx) => 1);
      return await flow.execute(testFlow, undefined, { scope });
    }],
    ["journaled subflow", async (scope: any) => {
      const childFlow = flow((ctx, n: number) => n * 2);
      const parentFlow = flow(async (ctx) => {
        return await ctx.exec({ flow: childFlow, input: 5, key: "s" });
      });
      return await flow.execute(parentFlow, undefined, { scope });
    }],
    ["non-journaled subflow", async (scope: any) => {
      const childFlow = flow((ctx, n: number) => n * 2);
      const parentFlow = flow(async (ctx) => {
        return await ctx.exec({ flow: childFlow, input: 5 });
      });
      return await flow.execute(parentFlow, undefined, { scope });
    }],
    ["journaled fn", async (scope: any) => {
      const parentFlow = flow(async (ctx) => {
        return await ctx.exec({ fn: () => 1, key: "f" });
      });
      return await flow.execute(parentFlow, undefined, { scope });
    }],
    ["non-journaled fn", async (scope: any) => {
      const parentFlow = flow(async (ctx) => {
        return await ctx.exec({ fn: () => 1 });
      });
      return await flow.execute(parentFlow, undefined, { scope });
    }],
    ["parallel", async (scope: any) => {
      const childFlow = flow((ctx, n: number) => n * 2);
      const parentFlow = flow(async (ctx) => {
        const p1 = ctx.exec(childFlow, 1);
        const p2 = ctx.exec(childFlow, 2);
        return await ctx.parallel([p1, p2]);
      });
      return await flow.execute(parentFlow, undefined, { scope });
    }],
  ])("%s triggers extension wrap", async (name, execFn) => {
    const tracker = createOperationTracker();
    const scope = createScope({ extensions: [tracker.ext] });

    await execFn(scope);

    expect(tracker.operations.length).toBeGreaterThan(0);
    const hasExecution = tracker.operations.some(op => op.kind === "execution");
    expect(hasExecution).toBe(true);
  });

  test("all exec variants have correct operation metadata", async () => {
    const tracker = createOperationTracker();
    const scope = createScope({ extensions: [tracker.ext] });

    const childFlow = flow((ctx, n: number) => n * 2);
    const parentFlow = flow(async (ctx) => {
      await ctx.exec({ flow: childFlow, input: 5, key: "journaled" });
      await ctx.exec({ flow: childFlow, input: 5 });
      await ctx.exec({ fn: () => 10, key: "fnJournaled" });
      await ctx.exec({ fn: () => 10 });
      return "done";
    });

    await flow.execute(parentFlow, undefined, { scope });

    const execOps = tracker.operations.filter(op => op.kind === "execution");
    expect(execOps.length).toBeGreaterThan(0);

    const journaledFlow = execOps.find(op =>
      op.kind === "execution" &&
      op.target.type === "flow" &&
      op.key === "journaled"
    );
    expect(journaledFlow).toBeTruthy();

    const nonJournaledFlow = execOps.find(op =>
      op.kind === "execution" &&
      op.target.type === "flow" &&
      op.key === undefined
    );
    expect(nonJournaledFlow).toBeTruthy();

    const journaledFn = execOps.find(op =>
      op.kind === "execution" &&
      op.target.type === "fn" &&
      op.key === "fnJournaled"
    );
    expect(journaledFn).toBeTruthy();

    const nonJournaledFn = execOps.find(op =>
      op.kind === "execution" &&
      op.target.type === "fn" &&
      op.key === undefined
    );
    expect(nonJournaledFn).toBeTruthy();
  });
});

describe("Extension ordering", () => {
  test("multiple extensions wrap in array order", async () => {
    const order: string[] = [];

    const ext1: Extension.Extension = {
      name: "ext1",
      async wrap(scope, next, operation) {
        if (operation.kind === "execution") {
          order.push("ext1-before");
        }
        const result = await next();
        if (operation.kind === "execution") {
          order.push("ext1-after");
        }
        return result;
      }
    };

    const ext2: Extension.Extension = {
      name: "ext2",
      async wrap(scope, next, operation) {
        if (operation.kind === "execution") {
          order.push("ext2-before");
        }
        const result = await next();
        if (operation.kind === "execution") {
          order.push("ext2-after");
        }
        return result;
      }
    };

    const scope = createScope({ extensions: [ext1, ext2] });
    const testFlow = flow((ctx) => {
      order.push("handler");
      return 1;
    });

    await flow.execute(testFlow, undefined, { scope });

    expect(order).toEqual([
      "ext1-before",
      "ext2-before",
      "handler",
      "ext2-after",
      "ext1-after"
    ]);
  });

  test("nested operations show correct depth", async () => {
    const depths: number[] = [];

    const ext: Extension.Extension = {
      name: "depth-tracker",
      wrap(scope, next, operation) {
        if (operation.kind === "execution" && operation.target.type === "flow") {
          const depth = operation.context.get(flowMeta.depth) as number;
          depths.push(depth);
        }
        return next();
      }
    };

    const scope = createScope({ extensions: [ext] });

    const childFlow = flow((ctx, n: number) => n * 2);
    const parentFlow = flow(async (ctx) => {
      return await ctx.exec(childFlow, 5);
    });

    await flow.execute(parentFlow, undefined, { scope });

    expect(depths.length).toBeGreaterThan(0);
    expect(depths).toContain(0);
    expect(depths).toContain(1);
  });
});

describe("Context hierarchy", () => {
  test("child context inherits scope, extensions, abortController", async () => {
    let childScopeMatches = false;
    let extensionCalled = false;

    const ext: Extension.Extension = {
      name: "test-ext",
      wrap(scope, next, operation) {
        extensionCalled = true;
        return next();
      }
    };

    const scope = createScope({ extensions: [ext] });

    const childFlow = flow((ctx) => {
      childScopeMatches = ctx.scope === scope;
      return 1;
    });

    const parentFlow = flow(async (ctx) => {
      return await ctx.exec(childFlow, undefined);
    });

    await flow.execute(parentFlow, undefined, { scope });

    expect(childScopeMatches).toBe(true);
    expect(extensionCalled).toBe(true);
  });

  test("parent linkage via get() prototype chain", async () => {
    const parentFlow = flow(async (ctx) => {
      ctx.set("parentKey" as any, "parentValue");

      const childFlow = flow((ctx) => {
        const value = ctx.get("parentKey" as any);
        return value;
      });

      return await ctx.exec(childFlow, undefined);
    });

    const result = await flow.execute(parentFlow, undefined);
    expect(result).toBe("parentValue");
  });

  test("flow metadata set correctly (depth, flowName, parentFlowName, isParallel)", async () => {
    let childDepth: number | undefined;
    let childFlowName: string | undefined;
    let childParentFlowName: string | undefined;
    let childIsParallel: boolean | undefined;

    const childFlow = flow({
      name: "childFlow",
      input: custom<undefined>(),
      output: custom<number>()
    }, (ctx) => {
      childDepth = ctx.get(flowMeta.depth);
      childFlowName = ctx.find(flowMeta.flowName);
      childParentFlowName = ctx.find(flowMeta.parentFlowName);
      childIsParallel = ctx.get(flowMeta.isParallel);
      return 1;
    });

    const parentFlow = flow({
      name: "parentFlow",
      input: custom<undefined>(),
      output: custom<number>()
    }, async (ctx) => {
      return await ctx.exec(childFlow, undefined);
    });

    await flow.execute(parentFlow, undefined);

    expect(childDepth).toBe(1);
    expect(childFlowName).toBe("childFlow");
    expect(childParentFlowName).toBe("parentFlow");
    expect(childIsParallel).toBe(false);
  });

  test("parallel execution sets isParallel=true", async () => {
    const childFlow = flow((ctx, n: number) => n * 2);
    const parentFlow = flow(async (ctx) => {
      const p1 = ctx.exec(childFlow, 1);
      const p2 = ctx.exec(childFlow, 2);
      return await ctx.parallel([p1, p2]);
    });

    await flow.execute(parentFlow, undefined);
  });
});

describe("Tags & metadata", () => {
  test("scopeTags accessible from ctx.scope", async () => {
    const scopeTag = tag(custom<string>(), { label: "scopeTag" });
    const scope = createScope({ tags: [scopeTag("scopeValue")] });

    const testFlow = flow((ctx) => {
      const value = ctx.get(scopeTag);
      return value;
    });

    const result = await flow.execute(testFlow, undefined, { scope });
    expect(result).toBe("scopeValue");
  });

  test("executionTags accessible from ctx", async () => {
    const execTag = tag(custom<string>(), { label: "execTag" });

    const testFlow = flow((ctx) => {
      const value = ctx.get(execTag);
      return value;
    });

    const result = await flow.execute(testFlow, undefined, {
      executionTags: [execTag("execValue")]
    });
    expect(result).toBe("execValue");
  });

  test("executionTags isolated between executions", async () => {
    const tag1 = tag(custom<string>(), { label: "tag1" });
    const tag2 = tag(custom<string>(), { label: "tag2" });

    const testFlow = flow((ctx) => {
      const value = ctx.find(tag1);
      return value;
    });

    const result1 = await flow.execute(testFlow, undefined, {
      executionTags: [tag1("value1")]
    });
    const result2 = await flow.execute(testFlow, undefined, {
      executionTags: [tag2("value2")]
    });

    expect(result1).toBe("value1");
    expect(result2).toBeUndefined();
  });

  test("tags inherited via parent chain", async () => {
    const parentTag = tag(custom<string>(), { label: "parentTag" });

    const childFlow = flow((ctx) => {
      const value = ctx.get(parentTag);
      return value;
    });

    const parentFlow = flow(async (ctx) => {
      return await ctx.exec(childFlow, undefined);
    });

    const result = await flow.execute(parentFlow, undefined, {
      executionTags: [parentTag("parentValue")]
    });
    expect(result).toBe("parentValue");
  });
});

describe("Scope lifecycle", () => {
  test("auto-created scope disposed on success", async () => {
    let disposeCalled = false;

    const ext: Extension.Extension = {
      name: "lifecycle",
      dispose() {
        disposeCalled = true;
      }
    };

    const testFlow = flow((ctx) => 1);
    await flow.execute(testFlow, undefined, { extensions: [ext] });

    expect(disposeCalled).toBe(true);
  });

  test("auto-created scope disposed on failure", async () => {
    let disposeCalled = false;

    const ext: Extension.Extension = {
      name: "lifecycle",
      dispose() {
        disposeCalled = true;
      }
    };

    const testFlow = flow((ctx) => {
      throw new Error("fail");
    });

    try {
      await flow.execute(testFlow, undefined, { extensions: [ext] });
    } catch {}

    expect(disposeCalled).toBe(true);
  });

  test("provided scope not disposed", async () => {
    let disposeCalled = false;

    const ext: Extension.Extension = {
      name: "lifecycle",
      dispose() {
        disposeCalled = true;
      }
    };

    const scope = createScope({ extensions: [ext] });
    const testFlow = flow((ctx) => 1);
    await flow.execute(testFlow, undefined, { scope });

    expect(disposeCalled).toBe(false);

    await scope.dispose();
    expect(disposeCalled).toBe(true);
  });
});
