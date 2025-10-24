import { describe, test, expect, vi } from "vitest";
import { flow, provide } from "../src";
import { custom } from "../src/ssch";

describe("Flow API Simplification", () => {
  describe("Schema-based patterns", () => {
    test("flow(config) returns FlowDefinition", () => {
      const def = flow({
        name: "getUserById",
        input: custom<string>(),
        output: custom<{ id: string; name: string }>(),
      });

      expect(def).toBeDefined();
      expect(def.name).toBe("getUserById");
      expect(typeof def.handler).toBe("function");
    });

    test("flow(config, handler) creates flow with schemas", async () => {
      const getUserById = flow(
        {
          name: "getUserById",
          input: custom<string>(),
          output: custom<{ id: string; name: string }>(),
        },
        (_ctx, id) => ({ id, name: `User ${id}` })
      );

      const result = await flow.execute(getUserById, "123");

      expect(result).toEqual({ id: "123", name: "User 123" });
    });

    test("flow(config, deps, handler) creates flow with schemas and dependencies", async () => {
      const dbService = provide(() => ({ query: vi.fn(() => ({ id: "1", name: "Alice" })) }));
      const getUserById = flow(
        {
          name: "getUserById",
          input: custom<string>(),
          output: custom<{ id: string; name: string }>(),
        },
        dbService,
        (db, _ctx, id) => {
          db.query();
          return { id, name: `User ${id}` };
        }
      );

      const result = await flow.execute(getUserById, "123");

      expect(result).toEqual({ id: "123", name: "User 123" });
    });

    test("definition.handler(handler) creates flow from definition", async () => {
      const def = flow({
        name: "double",
        input: custom<number>(),
        output: custom<number>(),
      });
      const doubleFlow = def.handler((_ctx, n) => n * 2);

      const result = await flow.execute(doubleFlow, 5);

      expect(result).toBe(10);
    });

    test("definition.handler(deps, handler) creates flow with dependencies", async () => {
      const configService = provide(() => ({ multiplier: 3 }));
      const def = flow({
        name: "multiply",
        input: custom<number>(),
        output: custom<number>(),
      });
      const multiplyFlow = def.handler(configService, (config, _ctx, n) => n * config.multiplier);

      const result = await flow.execute(multiplyFlow, 5);

      expect(result).toBe(15);
    });
  });

  describe("Inference-based patterns", () => {
    test("flow(handler) creates flow without schemas", async () => {
      const double = flow((_ctx, n: number) => n * 2);

      const result = await flow.execute(double, 5);

      expect(result).toBe(10);
    });

    test("flow(deps, handler) creates flow with dependencies but no schemas", async () => {
      const configService = provide(() => ({ factor: 4 }));
      const multiply = flow(configService, (config, _ctx, n: number) => n * config.factor);

      const result = await flow.execute(multiply, 5);

      expect(result).toBe(20);
    });
  });

  describe("Discrimination logic", () => {
    test("distinguishes between handler and config object", async () => {
      const handlerFlow = flow((_ctx, n: number) => n * 2);
      const configFlow = flow(
        { name: "double", input: custom<number>(), output: custom<number>() },
        (_ctx, n) => n * 2
      );

      const result1 = await flow.execute(handlerFlow, 5);
      const result2 = await flow.execute(configFlow, 5);

      expect(result1).toBe(10);
      expect(result2).toBe(10);
    });

    test("distinguishes between deps and handler function", async () => {
      const service = provide(() => ({ value: 10 }));
      const depsFlow = flow(service, (svc, _ctx, n: number) => n + svc.value);
      const noDepFlow = flow((_ctx, n: number) => n * 2);

      const result1 = await flow.execute(depsFlow, 5);
      const result2 = await flow.execute(noDepFlow, 5);

      expect(result1).toBe(15);
      expect(result2).toBe(10);
    });

    test("config only returns definition, not flow", () => {
      const def = flow({
        name: "test",
        input: custom<number>(),
        output: custom<number>(),
      });

      expect(typeof def.handler).toBe("function");
      expect(def.name).toBe("test");
    });
  });

  describe("Optional config fields", () => {
    test("config without version defaults to 1.0.0", async () => {
      const def = flow({
        name: "test",
        input: custom<number>(),
        output: custom<number>(),
      });

      expect(def.version).toBe("1.0.0");
    });

    test("config with explicit version uses that version", async () => {
      const def = flow({
        name: "test",
        version: "2.1.0",
        input: custom<number>(),
        output: custom<number>(),
      });

      expect(def.version).toBe("2.1.0");
    });

    test("config without tags has empty tags array", async () => {
      const def = flow({
        name: "test",
        input: custom<number>(),
        output: custom<number>(),
      });

      expect(def.tags).toEqual([]);
    });
  });

  describe("Edge cases", () => {
    test("void input flow works with inference pattern", async () => {
      const constant = flow<void, number>(() => 42);

      const result = await flow.execute(constant, undefined);

      expect(result).toBe(42);
    });

    test("void input flow works with schema pattern", async () => {
      const constant = flow(
        { name: "constant", input: custom<void>(), output: custom<number>() },
        () => 42
      );

      const result = await flow.execute(constant, undefined);

      expect(result).toBe(42);
    });

    test("object dependencies are correctly discriminated from config", async () => {
      const deps = { service: provide(() => ({ value: 100 })) };
      const withDeps = flow(deps, ({ service }, _ctx, n: number) => n + service.value);

      const result = await flow.execute(withDeps, 5);

      expect(result).toBe(105);
    });
  });

  describe("Removed patterns (should not exist)", () => {
    test("flow.define() method should not exist", () => {
      expect((flow as any).define).toBeUndefined();
    });

    test("config with handler property should not work", () => {
      expect(() => {
        flow({
          name: "test",
          input: custom<number>(),
          output: custom<number>(),
          handler: (_ctx: any, n: number) => n * 2,
        } as any);
      }).toThrow();
    });

    test("config with dependencies property should not work", () => {
      const service = provide(() => ({ value: 10 }));
      expect(() => {
        flow({
          name: "test",
          input: custom<number>(),
          output: custom<number>(),
          dependencies: service,
          handler: (_svc: any, _ctx: any, n: number) => n * 2,
        } as any);
      }).toThrow();
    });
  });
});
