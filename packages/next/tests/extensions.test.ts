import { describe, test, expect, vi } from "vitest";
import { flow, provide } from "../src";
import type { Extension } from "../src/types";

describe("Extension Operation Tracking", () => {
  test("captures journal operation parameters", async () => {
    type JournalRecord = {
      key: string;
      params?: readonly unknown[];
      output?: unknown;
    };

    const journalRecords: JournalRecord[] = [];

    const journalCapture: Extension.Extension = {
      name: "journal-capture",
      wrap: async (context, next, operation) => {
        if (operation.kind === "journal") {
          const record: JournalRecord = {
            key: operation.key,
            params: operation.params,
          };

          try {
            const result = await next();
            record.output = result;
            journalRecords.push(record);
            return result;
          } catch (error) {
            journalRecords.push(record);
            throw error;
          }
        }
        return next();
      },
    };

    const multiply = (a: number, b: number) => a * b;
    const add = (a: number, b: number) => a + b;

    const mathFlow = flow(async (ctx, input: { x: number; y: number }) => {
      const product = await ctx.run("multiply", multiply, input.x, input.y);
      const sum = await ctx.run("add", add, input.x, input.y);
      const combined = await ctx.run("combine", () => product + sum);

      return { product, sum, combined };
    });

    const result = await flow.execute(
      mathFlow,
      { x: 5, y: 3 },
      { extensions: [journalCapture] }
    );

    expect(result).toEqual({
      product: 15,
      sum: 8,
      combined: 23,
    });

    expect(journalRecords).toHaveLength(3);

    const multiplyRecord = journalRecords.find((r) => r.key === "multiply");
    expect(multiplyRecord).toBeDefined();
    expect(multiplyRecord?.params).toEqual([5, 3]);
    expect(multiplyRecord?.output).toBe(15);

    const addRecord = journalRecords.find((r) => r.key === "add");
    expect(addRecord).toBeDefined();
    expect(addRecord?.params).toEqual([5, 3]);
    expect(addRecord?.output).toBe(8);

    const combineRecord = journalRecords.find((r) => r.key === "combine");
    expect(combineRecord).toBeDefined();
    expect(combineRecord?.params).toBeUndefined();
    expect(combineRecord?.output).toBe(23);
  });

  test("backward compatibility - journal without parameters", async () => {
    const journalRecords: Array<{
      key: string;
      params?: readonly unknown[];
      hasParams: boolean;
    }> = [];

    const tracker: Extension.Extension = {
      name: "tracker",
      wrap: async (context, next, operation) => {
        if (operation.kind === "journal") {
          journalRecords.push({
            key: operation.key,
            params: operation.params,
            hasParams: operation.params !== undefined,
          });
        }
        return next();
      },
    };

    const oldStyleFlow = flow(async (ctx, input: number) => {
      const a = await ctx.run("closure", () => input * 2);
      const b = await ctx.run("arrow", () => {
        return input + 10;
      });
      return a + b;
    });

    const result = await flow.execute(oldStyleFlow, 5, {
      extensions: [tracker],
    });

    expect(result).toBe(25);

    expect(journalRecords).toHaveLength(2);
    expect(journalRecords.every((r) => !r.hasParams)).toBe(true);
  });

  test("demonstrates input parameter capture", async () => {
    const capturedInputs: Array<{ operation: string; input: unknown }> = [];

    const inputCapture: Extension.Extension = {
      name: "input-capture",
      wrap: async (context, next, operation) => {
        if (operation.kind === "execute") {
          capturedInputs.push({
            operation: `execute:${operation.definition.name}`,
            input: operation.input,
          });
        } else if (operation.kind === "subflow") {
          capturedInputs.push({
            operation: `subflow:${operation.definition.name}`,
            input: operation.input,
          });
        }
        return next();
      },
    };

    const addOne = flow((_ctx, x: number) => x + 1);
    const double = flow((_ctx, x: number) => x * 2);

    const composed = flow(async (ctx, input: { value: number }) => {
      const added = await ctx.exec(addOne, input.value);
      const doubled = await ctx.exec(double, added);
      return { original: input.value, result: doubled };
    });

    const result = await flow.execute(
      composed,
      { value: 5 },
      { extensions: [inputCapture] }
    );

    expect(result).toEqual({ original: 5, result: 12 });

    expect(capturedInputs).toEqual([
      { operation: "execute:anonymous", input: { value: 5 } },
      { operation: "subflow:anonymous", input: 5 },
      { operation: "execute:anonymous", input: 5 },
      { operation: "subflow:anonymous", input: 6 },
      { operation: "execute:anonymous", input: 6 },
    ]);

    const rootExecute = capturedInputs.find(
      (c) => c.operation === "execute:anonymous" && typeof c.input === "object"
    );
    expect(rootExecute?.input).toEqual({ value: 5 });

    const subflowInputs = capturedInputs
      .filter((c) => c.operation.startsWith("subflow:"))
      .map((c) => c.input);
    expect(subflowInputs).toEqual([5, 6]);
  });

  test("captures inputs, outputs, and errors for all operations", async () => {
    type OperationRecord = {
      kind: string;
      input?: unknown;
      output?: unknown;
      error?: unknown;
      duration?: number;
    };

    const records: OperationRecord[] = [];

    const capturingExtension: Extension.Extension = {
      name: "capture",
      wrap: async (context, next, operation) => {
        const start = Date.now();
        const record: OperationRecord = { kind: operation.kind };

        if (operation.kind === "execute") {
          record.input = operation.input;
        } else if (operation.kind === "subflow") {
          record.input = operation.input;
        }

        try {
          const result = await next();
          record.output = result;
          record.duration = Date.now() - start;
          records.push(record);
          return result;
        } catch (error) {
          record.error = error;
          record.duration = Date.now() - start;
          records.push(record);
          throw error;
        }
      },
    };

    const api = provide(() => ({
      fetch: vi.fn((url: string) => Promise.resolve({ data: url })),
    }));

    const successFlow = flow(
      { api },
      async ({ api }, ctx, input: { value: number }) => {
        const data = await ctx.run("fetch", () => api.fetch("/data"));
        return { result: input.value * 2, data: data.data };
      }
    );

    const errorFlow = flow(
      { api },
      async ({ api }, ctx, input: { shouldFail: boolean }) => {
        if (input.shouldFail) {
          throw new Error("Intentional failure");
        }
        return { success: true };
      }
    );

    const result = await flow.execute(successFlow, { value: 10 }, {
      extensions: [capturingExtension],
    });

    expect(result.result).toBe(20);
    expect(result.data).toBe("/data");

    const executeRecord = records.find((r) => r.kind === "execute");
    expect(executeRecord).toBeDefined();
    expect(executeRecord?.input).toEqual({ value: 10 });
    expect(executeRecord?.output).toEqual({ result: 20, data: "/data" });
    expect(executeRecord?.error).toBeUndefined();
    expect(executeRecord?.duration).toBeGreaterThanOrEqual(0);

    const journalRecord = records.find((r) => r.kind === "journal");
    expect(journalRecord).toBeDefined();
    expect(journalRecord?.output).toEqual({ data: "/data" });
    expect(journalRecord?.error).toBeUndefined();

    records.length = 0;

    try {
      await flow.execute(errorFlow, { shouldFail: true }, {
        extensions: [capturingExtension],
      });
      expect.fail("Should have thrown");
    } catch (error: unknown) {
      expect((error as Error).message).toBe("Intentional failure");
    }

    const errorExecuteRecord = records.find((r) => r.kind === "execute");
    expect(errorExecuteRecord).toBeDefined();
    expect(errorExecuteRecord?.input).toEqual({ shouldFail: true });
    expect(errorExecuteRecord?.output).toBeUndefined();
    expect(errorExecuteRecord?.error).toBeDefined();
    expect((errorExecuteRecord?.error as Error).message).toBe(
      "Intentional failure"
    );
  });

  test("tracks all operation types in complex flow execution", async () => {
    const operations: Array<{ kind: string; details: string }> = [];

    const trackingExtension: Extension.Extension = {
      name: "tracker",
      wrap: async (context, next, operation) => {
        switch (operation.kind) {
          case "execute":
            operations.push({
              kind: "execute",
              details: `flow=${operation.definition.name} depth=${operation.depth}`,
            });
            break;
          case "journal":
            operations.push({
              kind: "journal",
              details: `key=${operation.key} replay=${operation.isReplay}`,
            });
            break;
          case "subflow":
            operations.push({
              kind: "subflow",
              details: `flow=${operation.definition.name} journaled=${operation.journalKey !== undefined}`,
            });
            break;
          case "parallel":
            operations.push({
              kind: "parallel",
              details: `mode=${operation.mode} count=${operation.promiseCount}`,
            });
            break;
          case "resolve":
            break;
        }
        return next();
      },
    };

    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({ data: `fetched from ${url}` })
    );
    const api = provide(() => ({ fetch: fetchMock }));

    const fetchUser = flow(api, async (api, ctx, id: number) => {
      const response = await ctx.run("fetch-user", () =>
        api.fetch(`/users/${id}`)
      );
      return { userId: id, username: `user${id}`, raw: response.data };
    });

    const fetchPosts = flow({ api }, async ({ api }, ctx, userId: number) => {
      const response = await ctx.run("fetch-posts", () =>
        api.fetch(`/posts?userId=${userId}`)
      );
      return { posts: [{ id: 1, title: "Post 1" }], raw: response.data };
    });

    const getUserStats = flow({ api }, async ({ api }, ctx, userId: number) => {
      const response = await ctx.run("fetch-stats", () =>
        api.fetch(`/stats/${userId}`)
      );
      return { views: 100, likes: 50 };
    });

    type UserWithPosts = {
      userId: number;
      username: string;
      raw: string;
      postCount: number;
      stats: { views: number; likes: number };
    };

    const getUserWithPosts = flow(
      { api },
      async ({ api: _api }, ctx, userId: number): Promise<UserWithPosts> => {
        const userPromise = ctx.exec(fetchUser, userId);
        const postsPromise = ctx.exec(fetchPosts, userId);
        const statsPromise = ctx.exec(getUserStats, userId);

        const parallelResult = await ctx.parallel([
          userPromise,
          postsPromise,
          statsPromise,
        ]);

        const [user, posts, stats] = parallelResult.results;

        const enriched = await ctx.run("enrich", () => ({
          ...user,
          postCount: posts.posts.length,
          stats,
        }));

        return enriched;
      }
    );

    const result = await flow.execute(getUserWithPosts, 42, {
      extensions: [trackingExtension],
    });

    expect(result.userId).toBe(42);
    expect(result.username).toBe("user42");
    expect(result.postCount).toBe(1);
    expect(result.stats.views).toBe(100);

    expect(operations).toEqual([
      { kind: "execute", details: "flow=anonymous depth=0" },
      { kind: "subflow", details: "flow=anonymous journaled=false" },
      { kind: "subflow", details: "flow=anonymous journaled=false" },
      { kind: "subflow", details: "flow=anonymous journaled=false" },
      { kind: "parallel", details: "mode=parallel count=3" },
      { kind: "execute", details: "flow=anonymous depth=1" },
      { kind: "journal", details: "key=fetch-user replay=false" },
      { kind: "execute", details: "flow=anonymous depth=1" },
      { kind: "journal", details: "key=fetch-posts replay=false" },
      { kind: "execute", details: "flow=anonymous depth=1" },
      { kind: "journal", details: "key=fetch-stats replay=false" },
      { kind: "journal", details: "key=enrich replay=false" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith("/users/42");
    expect(fetchMock).toHaveBeenCalledWith("/posts?userId=42");
    expect(fetchMock).toHaveBeenCalledWith("/stats/42");
  });

  test("captures detailed information for all operation types including parallel and subflows", async () => {
    type DetailedRecord = {
      kind: string;
      flowName?: string;
      input?: unknown;
      output?: unknown;
      error?: unknown;
      journalKey?: string;
      isReplay?: boolean;
      parallelMode?: string;
      promiseCount?: number;
    };

    const detailedRecords: DetailedRecord[] = [];

    const detailedExtension: Extension.Extension = {
      name: "detailed-tracker",
      wrap: async (context, next, operation) => {
        const record: DetailedRecord = { kind: operation.kind };

        switch (operation.kind) {
          case "execute":
            record.flowName = operation.definition.name;
            record.input = operation.input;
            break;
          case "journal":
            record.journalKey = operation.key;
            record.isReplay = operation.isReplay;
            break;
          case "subflow":
            record.flowName = operation.definition.name;
            record.input = operation.input;
            record.journalKey = operation.journalKey;
            break;
          case "parallel":
            record.parallelMode = operation.mode;
            record.promiseCount = operation.promiseCount;
            break;
          case "resolve":
            break;
        }

        try {
          const result = await next();
          record.output = result;
          detailedRecords.push(record);
          return result;
        } catch (error) {
          record.error = error;
          detailedRecords.push(record);
          throw error;
        }
      },
    };

    const api = provide(() => ({
      multiply: vi.fn((x: number) => x * 2),
      add: vi.fn((x: number) => x + 10),
    }));

    const multiplyFlow = flow(
      { api },
      async ({ api }, ctx, input: number) => {
        const result = await ctx.run("multiply-op", () => api.multiply(input));
        return result;
      }
    );

    const addFlow = flow({ api }, async ({ api }, ctx, input: number) => {
      const result = await ctx.run("add-op", () => api.add(input));
      return result;
    });

    const composedFlow = flow(
      { api },
      async ({ api }, ctx, input: number) => {
        const p1 = ctx.exec(multiplyFlow, input);
        const p2 = ctx.exec(addFlow, input);

        const parallelResult = await ctx.parallel([p1, p2]);
        const [multiplied, added] = parallelResult.results;

        const combined = await ctx.run("combine", () => multiplied + added);
        return { multiplied, added, combined };
      }
    );

    const result = await flow.execute(composedFlow, 5, {
      extensions: [detailedExtension],
    });

    expect(result).toEqual({
      multiplied: 10,
      added: 15,
      combined: 25,
    });

    const executeRecords = detailedRecords.filter((r) => r.kind === "execute");
    expect(executeRecords).toHaveLength(3);

    const mainExecuteRecord = executeRecords.find(
      (r) =>
        typeof r.output === "object" &&
        r.output !== null &&
        "combined" in r.output
    );
    expect(mainExecuteRecord).toBeDefined();
    expect(mainExecuteRecord?.input).toBe(5);
    expect(mainExecuteRecord?.output).toEqual({
      multiplied: 10,
      added: 15,
      combined: 25,
    });

    const subflowRecords = detailedRecords.filter((r) => r.kind === "subflow");
    expect(subflowRecords).toHaveLength(2);
    expect(subflowRecords[0].input).toBe(5);
    expect(subflowRecords[0].journalKey).toBeUndefined();
    expect(subflowRecords[1].input).toBe(5);
    expect(subflowRecords[1].journalKey).toBeUndefined();

    const journalRecords = detailedRecords.filter((r) => r.kind === "journal");
    expect(journalRecords.length).toBeGreaterThanOrEqual(3);

    const multiplyJournal = journalRecords.find(
      (r) => r.journalKey === "multiply-op"
    );
    expect(multiplyJournal).toBeDefined();
    expect(multiplyJournal?.output).toBe(10);
    expect(multiplyJournal?.isReplay).toBe(false);

    const addJournal = journalRecords.find((r) => r.journalKey === "add-op");
    expect(addJournal).toBeDefined();
    expect(addJournal?.output).toBe(15);
    expect(addJournal?.isReplay).toBe(false);

    const combineJournal = journalRecords.find(
      (r) => r.journalKey === "combine"
    );
    expect(combineJournal).toBeDefined();
    expect(combineJournal?.output).toBe(25);
    expect(combineJournal?.isReplay).toBe(false);

    const parallelRecords = detailedRecords.filter(
      (r) => r.kind === "parallel"
    );
    expect(parallelRecords).toHaveLength(1);
    expect(parallelRecords[0].parallelMode).toBe("parallel");
    expect(parallelRecords[0].promiseCount).toBe(2);
    expect(parallelRecords[0].output).toEqual({
      results: [10, 15],
      stats: { total: 2, succeeded: 2, failed: 0 },
    });
  });
});