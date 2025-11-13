import { describe, test, expect } from "vitest";
import { flow } from "../src/flow";
import { createScope } from "../src/scope";
import { custom } from "../src/ssch";
import { provide } from "../src/executor";
import { tag } from "../src/tag";

describe("Flow API - Creation variants", () => {
  test.each([
    ["no deps", () => flow((ctx, n: number) => n * 2), 5, 10],
    ["array deps", () => {
      const dep = provide(() => 10);
      return flow([dep], ([d], ctx, n: number) => d + n);
    }, 5, 15],
    ["object deps", () => {
      const dep = provide(() => 10);
      return flow({ a: dep }, ({ a }, ctx, n: number) => a + n);
    }, 5, 15],
    ["with config", () => flow({ input: custom<number>(), output: custom<number>() }, (ctx, n) => n * 2), 5, 10],
  ])("%s creates executable flow", async (_, createFlow, input, expected) => {
    const result = await flow.execute(createFlow(), input);
    expect(result).toBe(expected);
  });
});

describe("ctx.exec - All variants", () => {
  test.each([
    ["subflow no journal", (ctx: any, child: any) => ctx.exec(child, 5), 10],
    ["subflow journaled", (ctx: any, child: any) => ctx.exec({ flow: child, input: 5, key: "step1" }), 10],
    ["fn no journal", (ctx: any) => ctx.exec({ fn: () => 10 }), 10],
    ["fn journaled", (ctx: any) => ctx.exec({ fn: () => 10, key: "calc" }), 10],
  ])("%s executes correctly", async (_, execFn, expected) => {
    const childFlow = flow((ctx, n: number) => n * 2);
    const parentFlow = flow(async (ctx, n: number) => {
      const result = await execFn(ctx, childFlow);
      return result;
    });

    const result = await flow.execute(parentFlow, 1);
    expect(result).toBe(expected);
  });
});

describe("Input/output validation", () => {
  test.each([
    ["journaled flow", { key: "step" }],
    ["non-journaled flow", {}],
  ])("%s validates input and output", async (_, opts) => {
    let inputValidated = false;
    let outputValidated = false;

    const childFlow = flow({
      input: custom<number>((value) => {
        inputValidated = true;
        if (typeof value !== "number") {
          return { success: false, issues: [{ message: "Expected number" }] };
        }
        return value;
      }),
      output: custom<number>((value) => {
        outputValidated = true;
        if (typeof value !== "number") {
          return { success: false, issues: [{ message: "Expected number" }] };
        }
        return value;
      })
    }, (ctx, n) => n * 2);

    const parentFlow = flow(async (ctx) => {
      return await ctx.exec({ ...opts, flow: childFlow, input: 5 });
    });

    const result = await flow.execute(parentFlow, undefined);

    expect(inputValidated).toBe(true);
    expect(outputValidated).toBe(true);
    expect(result).toBe(10);
  });

  test.each([
    ["journaled flow", { key: "step" }],
    ["non-journaled flow", {}],
  ])("%s rejects invalid input", async (_, opts) => {
    const childFlow = flow({
      input: custom<number>((value) => {
        if (typeof value !== "number") {
          return { success: false, issues: [{ message: "Expected number" }] };
        }
        return value;
      }),
      output: custom<number>()
    }, (ctx, n) => n * 2);

    const parentFlow = flow(async (ctx) => {
      return await ctx.exec({ ...opts, flow: childFlow, input: "invalid" as any });
    });

    await expect(flow.execute(parentFlow, undefined)).rejects.toThrow("Expected number");
  });

  test.each([
    ["journaled flow", { key: "step" }],
    ["non-journaled flow", {}],
  ])("%s rejects invalid output", async (_, opts) => {
    const childFlow = flow({
      input: custom<number>(),
      output: custom<number>((value) => {
        if (typeof value !== "number") {
          return { success: false, issues: [{ message: "Expected number output" }] };
        }
        return value;
      })
    }, (ctx, n) => "invalid" as any);

    const parentFlow = flow(async (ctx) => {
      return await ctx.exec({ ...opts, flow: childFlow, input: 5 });
    });

    await expect(flow.execute(parentFlow, undefined)).rejects.toThrow("Expected number output");
  });
});

describe("Journaling", () => {
  test("stores results and replays on key match", async () => {
    let callCount = 0;
    const childFlow = flow((ctx, n: number) => {
      callCount++;
      return n * 2;
    });

    const parentFlow = flow(async (ctx, n: number) => {
      const r1 = await ctx.exec({ flow: childFlow, input: n, key: "calc" });
      const r2 = await ctx.exec({ flow: childFlow, input: n, key: "calc" });
      expect(r1).toBe(10);
      expect(r2).toBe(10);
      return r1 + r2;
    });

    const result = await flow.execute(parentFlow, 5);
    expect(result).toBe(20);
    expect(callCount).toBe(1);
  });

  test("stores errors with __error flag", async () => {
    let callCount = 0;
    const parentFlow = flow(async (ctx) => {
      try {
        await ctx.exec({ fn: () => {
          callCount++;
          throw new Error("test");
        }, key: "fail" });
      } catch {}

      try {
        await ctx.exec({ fn: () => {
          callCount++;
          throw new Error("test");
        }, key: "fail" });
      } catch {}

      return callCount;
    });

    const result = await flow.execute(parentFlow, undefined);
    expect(result).toBe(1);
  });

  test("resetJournal clears entries by pattern", async () => {
    let callCount = 0;
    const childFlow = flow((ctx, n: number) => {
      callCount++;
      return n * 2;
    });

    const parentFlow = flow(async (ctx, n: number) => {
      const r1 = await ctx.exec({ flow: childFlow, input: n, key: "calc" });
      expect(r1).toBe(10);
      ctx.resetJournal("calc");
      const r2 = await ctx.exec({ flow: childFlow, input: n, key: "calc" });
      expect(r2).toBe(10);
      return callCount;
    });

    const result = await flow.execute(parentFlow, 5);
    expect(result).toBe(2);
  });

  test("journal key format: flowName:depth:userKey", async () => {
    const scope = createScope();

    const childFlow = flow((ctx, n: number) => {
      return n * 2;
    });

    const parentFlow = flow(async (ctx, n: number) => {
      const result = await ctx.exec({ flow: childFlow, input: n, key: "mykey" });
      expect(result).toBe(10);
      return "done";
    });

    const result = await flow.execute(parentFlow, 5, { scope });
    expect(result).toBe("done");
  });
});

describe("Parallel execution", () => {
  test("ctx.parallel resolves all, returns stats", async () => {
    const childFlow = flow((ctx, n: number) => n * 2);
    const parentFlow = flow(async (ctx, n: number) => {
      const p1 = ctx.exec(childFlow, n);
      const p2 = ctx.exec(childFlow, n + 1);
      const result = await ctx.parallel([p1, p2]);

      expect(result.stats.total).toBe(2);
      expect(result.stats.succeeded).toBe(2);
      expect(result.stats.failed).toBe(0);
      expect(result.results).toEqual([10, 12]);
      expect(result.results[0]).toBe(10);
      expect(result.results[1]).toBe(12);
      return result;
    });

    const result = await flow.execute(parentFlow, 5);
    expect(result.stats.total).toBe(2);
    expect(result.results).toEqual([10, 12]);
  });

  test("ctx.parallelSettled handles mixed results, returns stats", async () => {
    const successFlow = flow((ctx, n: number) => n * 2);
    const failFlow = flow((ctx, n: number) => {
      throw new Error("fail");
    });

    const parentFlow = flow(async (ctx, n: number) => {
      const p1 = ctx.exec(successFlow, n);
      const p2 = ctx.exec(failFlow, n);
      const result = await ctx.parallelSettled([p1, p2]);

      expect(result.stats.total).toBe(2);
      expect(result.stats.succeeded).toBe(1);
      expect(result.stats.failed).toBe(1);
      expect(result.results[0].status).toBe("fulfilled");
      expect(result.results[1].status).toBe("rejected");
      if (result.results[0].status === "fulfilled") {
        expect(result.results[0].value).toBe(10);
      }
      if (result.results[1].status === "rejected") {
        expect(result.results[1].reason.message).toBe("fail");
      }
      return result;
    });

    const result = await flow.execute(parentFlow, 5);
    expect(result.stats.succeeded).toBe(1);
    expect(result.stats.failed).toBe(1);
  });
});

describe("Timeout & abort", () => {
  test.each([
    ["flow", async (ctx: any) => {
      const slowFlow = flow(async (ctx) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return "done";
      });
      return await ctx.exec({ flow: slowFlow, input: undefined, timeout: 10 });
    }],
    ["fn", async (ctx: any) => {
      return await ctx.exec({
        fn: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return "done";
        },
        timeout: 10
      });
    }],
  ])("%s aborts after timeout", async (_, execFn) => {
    const parentFlow = flow(execFn);
    await expect(flow.execute(parentFlow, undefined)).rejects.toThrow();
  });
});

describe("Flow spread tag syntax", () => {
  test("flow() accepts spread tags and makes them extractable", () => {
    const t1 = tag(custom<string>(), { label: "tag1" });
    const t2 = tag(custom<number>(), { label: "tag2" });
    const tagged1 = t1("test");
    const tagged2 = t2(42);

    const testFlow = flow((ctx, n: number) => n * 2, tagged1, tagged2);

    expect(t1.readFrom(testFlow)).toBe("test");
    expect(t2.readFrom(testFlow)).toBe(42);
    expect(testFlow.tags).toContain(tagged1);
    expect(testFlow.tags).toContain(tagged2);
  });

  test("flow() with dependencies accepts spread tags", () => {
    const t1 = tag(custom<string>(), { label: "depTag" });
    const tagged1 = t1("dep-test");
    const dep = provide(() => 10);

    const testFlow = flow([dep], ([d], ctx, n: number) => d + n, tagged1);

    expect(t1.readFrom(testFlow)).toBe("dep-test");
    expect(testFlow.tags).toContain(tagged1);
  });

  test("flow() without tags works as before (backward compatibility)", async () => {
    const noTagFlow = flow((ctx, n: number) => n * 3);
    const result = await flow.execute(noTagFlow, 7);
    expect(result).toBe(21);

    const dep = provide(() => 5);
    const depNoTagFlow = flow([dep], ([d], ctx, n: number) => d + n);
    const result2 = await flow.execute(depNoTagFlow, 10);
    expect(result2).toBe(15);
  });

  test("flow() throws on invalid tag in spread params", () => {
    expect(() => {
      flow((ctx, n: number) => n * 2, "not-a-tag" as any);
    }).toThrow("Invalid tag: expected Tag.Tagged from tag()");

    const dep = provide(() => 5);
    expect(() => {
      flow([dep], ([d], ctx, n: number) => d + n, { invalid: "object" } as any);
    }).toThrow("Invalid tag: expected Tag.Tagged from tag()");
  });

  test("flow() handles multiple tags with same key (first value wins)", () => {
    const t1 = tag(custom<string>(), { label: "duplicateKey" });
    const tagged1 = t1("first-value");
    const tagged2 = t1("second-value");

    const testFlow = flow((ctx, n: number) => n * 2, tagged1, tagged2);

    expect(t1.readFrom(testFlow)).toBe("first-value");
    expect(testFlow.tags?.filter(t => t.key === t1.key).length).toBe(2);
  });

  test("flow() config form uses tags array, not spread syntax", () => {
    const t1 = tag(custom<string>(), { label: "configTag" });
    const tagged1 = t1("config-value");

    const testFlow = flow({
      input: custom<number>(),
      output: custom<number>(),
      tags: [tagged1],
    }, (ctx, n: number) => n * 2);

    expect(t1.readFrom(testFlow)).toBe("config-value");
    expect(testFlow.tags).toContain(tagged1);
  });
});
