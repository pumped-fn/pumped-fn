import { describe, test, expect } from "vitest";
import { flow } from "../src";
import { meta } from "../src/meta";
import { custom } from "../src/ssch";

describe("Flow Execution Meta", () => {
  test("scopeMeta is applied to scope when creating new scope", async () => {
    const scopeConfig = meta("app.config", custom<{ env: string }>());

    const testFlow = flow((c) => {
      return scopeConfig.get(c.scope);
    });

    const result = await flow.execute(testFlow, undefined, {
      scopeMeta: [scopeConfig({ env: "production" })],
    });

    expect(result).toEqual({ env: "production" });
  });

  test("execution meta is accessible via flow context", async () => {
    const requestMeta = meta("request.id", custom<{ requestId: string }>());

    const testFlow = flow((c) => {
      return requestMeta.get(c);
    });

    const result = await flow.execute(testFlow, undefined, {
      meta: [requestMeta({ requestId: "req-123" })],
    });

    expect(result).toEqual({ requestId: "req-123" });
  });

  test("execution meta is isolated per execution", async () => {
    const requestMeta = meta("request.id", custom<{ requestId: string }>());

    const testFlow = flow((c) => {
      return requestMeta.get(c);
    });

    const result1 = await flow.execute(testFlow, undefined, {
      meta: [requestMeta({ requestId: "req-1" })],
    });

    const result2 = await flow.execute(testFlow, undefined, {
      meta: [requestMeta({ requestId: "req-2" })],
    });

    expect(result1).toEqual({ requestId: "req-1" });
    expect(result2).toEqual({ requestId: "req-2" });
  });

  test("both scopeMeta and execution meta can coexist", async () => {
    const scopeConfig = meta("app.config", custom<{ env: string }>());
    const requestMeta = meta("request.id", custom<{ requestId: string }>());

    const testFlow = flow((c) => {
      const scopeValue = scopeConfig.get(c.scope);
      const execValue = requestMeta.get(c);
      return { scope: scopeValue, exec: execValue };
    });

    const result = await flow.execute(testFlow, undefined, {
      scopeMeta: [scopeConfig({ env: "test" })],
      meta: [requestMeta({ requestId: "req-abc" })],
    });

    expect(result).toEqual({
      scope: { env: "test" },
      exec: { requestId: "req-abc" },
    });
  });

  test("execution meta doesn't affect scope when scope is provided", async () => {
    const { createScope } = await import("../src/scope");
    const requestMeta = meta("request.id", custom<{ requestId: string }>());

    const scope = createScope();

    const testFlow = flow((c) => {
      const scopeMetas = c.scope.metas;
      const execValue = requestMeta.get(c);
      return { scopeMetas, execValue };
    });

    const result = await flow.execute(testFlow, undefined, {
      scope,
      meta: [requestMeta({ requestId: "req-xyz" })],
    });

    expect(result.scopeMetas).toBeUndefined();
    expect(result.execValue).toEqual({ requestId: "req-xyz" });
  });
});
