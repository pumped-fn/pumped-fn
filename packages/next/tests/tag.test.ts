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
});
