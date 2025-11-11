import { describe, test, expect } from "vitest";
import { flow, createScope } from "../src";

describe("Flow.Context resetJournal", () => {
  test("resetJournal() clears all journal entries", async () => {
    const testFlow = flow(async (ctx, _input: void) => {
      await ctx.exec({ key: "step1", fn: () => "value1" });
      await ctx.exec({ key: "step2", fn: () => "value2" });
      await ctx.exec({ key: "step3", fn: () => "value3" });

      ctx.resetJournal();

      const result = await ctx.exec({ key: "step4", fn: () => "value4" });
      return result;
    });

    const result = await flow.execute(testFlow, undefined);
    expect(result).toBe("value4");
  });

  test("resetJournal(keyPattern) clears entries containing pattern", async () => {
    const testFlow = flow(async (ctx, _input: void) => {
      await ctx.exec({ key: "user:fetch", fn: () => "user-data" });
      await ctx.exec({ key: "user:save", fn: () => "user-saved" });
      await ctx.exec({ key: "post:fetch", fn: () => "post-data" });

      ctx.resetJournal("user");

      const result = await ctx.exec({ key: "final", fn: () => "done" });
      return result;
    });

    const result = await flow.execute(testFlow, undefined);
    expect(result).toBe("done");
  });

  test("resetJournal() allows re-execution of previously journaled operations", async () => {
    let executionCount = 0;

    const testFlow = flow(async (ctx, _input: void) => {
      await ctx.exec({ key: "operation", fn: () => {
        executionCount++;
        return executionCount;
      }});

      ctx.resetJournal();

      const result = await ctx.exec({ key: "operation", fn: () => {
        executionCount++;
        return executionCount;
      }});

      return result;
    });

    const scope = createScope();
    const result = await flow.execute(testFlow, undefined, { scope });

    expect(result).toBe(2);
    expect(executionCount).toBe(2);

    await scope.dispose();
  });

  test("resetJournal(keyPattern) only clears matching entries", async () => {
    let step1Count = 0;
    let step2Count = 0;

    const testFlow = flow(async (ctx, _input: void) => {
      await ctx.exec({ key: "db:user", fn: () => { step1Count++; return "user"; }});
      await ctx.exec({ key: "api:post", fn: () => { step2Count++; return "post"; }});

      ctx.resetJournal("db");

      await ctx.exec({ key: "db:user", fn: () => { step1Count++; return "user2"; }});
      await ctx.exec({ key: "api:post", fn: () => { step2Count++; return "post2"; }});

      return { step1Count, step2Count };
    });

    const scope = createScope();
    const result = await flow.execute(testFlow, undefined, { scope });

    expect(result.step1Count).toBe(2);
    expect(result.step2Count).toBe(1);

    await scope.dispose();
  });
});
