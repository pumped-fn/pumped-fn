import { createScope, custom, flow, tag } from "../src";

import { describe, it, expect } from "vitest";

describe("tag", () => {
  it("should create a tag", async () => {
    const value = tag(custom<string>());

    const scope = createScope({
      tags: [value("hello")],
    });

    const myFlow = flow([value], ([value], ctx) => {
      return value;
    });

    const executionContext = scope.createExecution({
      tags: [value("world")],
    });

    const anotherContext = scope.createExecution({
      tags: [value("me")],
    });

    let result = await executionContext.exec(myFlow, "world");
    expect(result).toBe("world");

    result = await anotherContext.exec(myFlow, "me");
    expect(result).toBe("me");
  });

  it("should correctly identify ExecutionContext with tagStore", () => {
    const value = tag(custom<string>());
    const scope = createScope();
    const ctx = scope.createExecution({ tags: [value("test")] });

    expect(value.extractFrom(ctx)).toBe("test");
  });

  it("should resolve same tag multiple times in same context", async () => {
    const value = tag(custom<string>());
    const scope = createScope({ tags: [value("scope")] });

    const flow1 = flow([value], ([v]) => v);
    const flow2 = flow([value], ([v]) => `${v}-2`);

    const ctx = scope.createExecution({ tags: [value("context")] });

    const result1 = await ctx.exec(flow1, undefined);
    const result2 = await ctx.exec(flow2, undefined);

    expect(result1).toBe("context");
    expect(result2).toBe("context-2");
  });

  it("should handle concurrent resolutions in different contexts", async () => {
    const value = tag(custom<string>());
    const scope = createScope({ tags: [value("scope")] });

    const myFlow = flow([value], ([v]) => v);

    const ctx1 = scope.createExecution({ tags: [value("ctx1")] });
    const ctx2 = scope.createExecution({ tags: [value("ctx2")] });
    const ctx3 = scope.createExecution({ tags: [value("ctx3")] });

    const [r1, r2, r3] = await Promise.all([
      ctx1.exec(myFlow, undefined),
      ctx2.exec(myFlow, undefined),
      ctx3.exec(myFlow, undefined),
    ]);

    expect(r1).toBe("ctx1");
    expect(r2).toBe("ctx2");
    expect(r3).toBe("ctx3");
  });
});
