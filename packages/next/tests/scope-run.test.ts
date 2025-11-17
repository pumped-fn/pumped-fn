import { describe, test, expect } from "vitest";
import { flow, FlowContext } from "../src/flow";
import { createScope } from "../src/scope";
import { provide, derive } from "../src/executor";
import { custom } from "../src/ssch";
import { tag } from "../src/tag";
import { mergeFlowTags } from "../src/tags/merge";
import { type Core, type Extension } from "../src/types";

describe("scope.run()", () => {
  test("basic resolution without params", async () => {
    const scope = createScope();
    const userService = provide(() => ({ listAll: () => ["user1", "user2"] }));

    const result = await scope.run({ userService }, ({ userService }) =>
      userService.listAll()
    );

    expect(result).toEqual(["user1", "user2"]);
    await scope.dispose();
  });

  test("with parameters using array form", async () => {
    const scope = createScope();
    const userService = provide(() => ({ getUser: (id: string) => `user-${id}` }));
    const postDb = provide(() => ({ getPosts: (page: number) => [`post-${page}`] }));

    const result = await scope.run(
      { userService, postDb },
      ({ userService, postDb }, userId: string, page: number) => ({
        user: userService.getUser(userId),
        posts: postDb.getPosts(page),
      }),
      ["user123", 1]
    );

    expect(result).toEqual({
      user: "user-user123",
      posts: ["post-1"],
    });
    await scope.dispose();
  });

  test("type inference validation with single executor", async () => {
    const scope = createScope();
    const counter = provide(() => 42);

    const result = await scope.run(counter, (value) => value * 2);

    expect(result).toBe(84);
    await scope.dispose();
  });

  test("type inference validation with array dependencies", async () => {
    const scope = createScope();
    const executor1 = provide(() => 1);
    const executor2 = provide(() => 2);

    const result = await scope.run([executor1, executor2], ([a, b]) => a + b);

    expect(result).toBe(3);
    await scope.dispose();
  });

  test("type inference validation with object dependencies", async () => {
    const scope = createScope();
    const executor1 = provide(() => 1);
    const executor2 = provide(() => "hello");

    const result = await scope.run({ num: executor1, str: executor2 }, ({ num, str }) => ({
      result: `${str}-${num}`,
    }));

    expect(result).toEqual({ result: "hello-1" });
    await scope.dispose();
  });

  test("error handling - dependency resolution failure", async () => {
    const scope = createScope();
    const failingExecutor = provide(() => {
      throw new Error("dependency failed");
    });

    await expect(
      scope.run({ failing: failingExecutor }, ({ failing }) => failing)
    ).rejects.toThrow("dependency failed");

    await scope.dispose();
  });

  test("error handling - callback throws", async () => {
    const scope = createScope();
    const executor = provide(() => 42);

    await expect(
      scope.run({ executor }, () => {
        throw new Error("callback error");
      })
    ).rejects.toThrow("callback error");

    await scope.dispose();
  });

  test("caching behavior - dependencies cached", async () => {
    const scope = createScope();
    let executionCount = 0;
    const executor = provide(() => {
      executionCount++;
      return 42;
    });

    await scope.run({ executor }, ({ executor }) => executor);
    await scope.run({ executor }, ({ executor }) => executor);

    expect(executionCount).toBe(1);
    await scope.dispose();
  });

  test("caching behavior - callback not cached", async () => {
    const scope = createScope();
    const executor = provide(() => 42);
    let callbackCount = 0;

    await scope.run({ executor }, ({ executor }) => {
      callbackCount++;
      return executor;
    });
    await scope.run({ executor }, ({ executor }) => {
      callbackCount++;
      return executor;
    });

    expect(callbackCount).toBe(2);
    await scope.dispose();
  });

  test("async callback returns Promise", async () => {
    const scope = createScope();
    const executor = provide(() => 42);

    const result = await scope.run({ executor }, async ({ executor }) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return executor * 2;
    });

    expect(result).toBe(84);
    await scope.dispose();
  });

  test("sync callback returns value", async () => {
    const scope = createScope();
    const executor = provide(() => 42);

    const result = await scope.run({ executor }, ({ executor }) => executor * 2);

    expect(result).toBe(84);
    await scope.dispose();
  });

  test("with nested dependencies", async () => {
    const scope = createScope();
    const base = provide(() => 10);
    const derived = derive({ base }, ({ base }) => base * 2);

    const result = await scope.run({ derived }, ({ derived }) => derived + 5);

    expect(result).toBe(25);
    await scope.dispose();
  });

  test("multiple parameters with different types", async () => {
    const scope = createScope();
    const executor = provide(() => ({ multiply: (a: number, b: number) => a * b }));

    const result = await scope.run(
      { executor },
      ({ executor }, a: number, b: string) => ({
        product: executor.multiply(a, parseInt(b)),
        types: `${typeof a}-${typeof b}`,
      }),
      [5, "10"]
    );

    expect(result).toEqual({
      product: 50,
      types: "number-string",
    });
    await scope.dispose();
  });

  test("empty object dependencies", async () => {
    const scope = createScope();

    const result = await scope.run({}, () => "no deps");

    expect(result).toBe("no deps");
    await scope.dispose();
  });

  test("dependency resolution with complex object", async () => {
    const scope = createScope();
    const config = provide(() => ({ api: "https://api.example.com", timeout: 5000 }));
    const logger = provide(() => ({ log: (msg: string) => `logged: ${msg}` }));

    const result = await scope.run(
      { config, logger },
      ({ config, logger }, endpoint: string) => ({
        url: `${config.api}${endpoint}`,
        timeout: config.timeout,
        message: logger.log("making request"),
      }),
      ["/users"]
    );

    expect(result).toEqual({
      url: "https://api.example.com/users",
      timeout: 5000,
      message: "logged: making request",
    });
    await scope.dispose();
  });

  test("throws when scope is disposed", async () => {
    const scope = createScope();
    const executor = provide(() => 42);

    await scope.dispose();

    expect(() => scope.run({ executor }, ({ executor }) => executor)).toThrow(
      "Scope is disposed"
    );
  });

  test("callback can access scope through closure", async () => {
    const scope = createScope();
    const executor = provide(() => 42);
    const other = provide(() => 10);

    const result = await scope.run({ executor }, async ({ executor }) => {
      const otherValue = await scope.resolve(other);
      return executor + otherValue;
    });

    expect(result).toBe(52);
    await scope.dispose();
  });
});

describe("scope tag merging", () => {
  test("scope.exec merges definition and execution tags preserving order", async () => {
    const defTagA = tag(custom<string>(), { label: "defA" });
    const defTagB = tag(custom<string>(), { label: "defB" });
    const execTag = tag(custom<string>(), { label: "exec" });

    const capture: string[][] = [];
    const captureExtension: Extension.Extension = {
      name: "capture-tags",
      wrap(scope, next, operation) {
        if (operation.kind === "execution" && operation.context instanceof FlowContext) {
          const tags = operation.context.tags?.map((tagged) => tagged.value as string) ?? [];
          capture.push(tags);
        }
        return next();
      },
    };

    const scope = createScope({ extensions: [captureExtension] });

    const testFlow = flow((ctx) => {
      return `${ctx.get(defTagA)}-${ctx.get(defTagB)}-${ctx.get(execTag)}`;
    }, defTagA("defA"), defTagB("defB"));

    const result = await scope.exec({
      flow: testFlow,
      input: undefined,
      tags: [execTag("execValue")],
    });

    expect(result).toBe("defA-defB-execValue");
    expect(capture).toEqual([["defA", "defB", "execValue"]]);

    await scope.dispose();
  });

  test("mergeFlowTags filters undefined entries while keeping order", () => {
    const defTag = tag(custom<string>(), { label: "def" });
    const execTag = tag(custom<string>(), { label: "exec" });

    const result = mergeFlowTags(
      [defTag("definition"), undefined],
      [undefined, execTag("execution")]
    );

    expect(result?.map((tagged) => tagged.value)).toEqual([
      "definition",
      "execution",
    ]);
  });

  test("mergeFlowTags returns undefined when no tags provided", () => {
    expect(mergeFlowTags(undefined, undefined)).toBeUndefined();
    expect(mergeFlowTags([], [])).toBeUndefined();
  });
});
