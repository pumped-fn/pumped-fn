import { describe, test, expect } from "vitest";
import { flow, tag } from "../src";
import { custom } from "../src/ssch";

describe("Flow Execution Meta", () => {
  test("scopeMeta applies configuration to newly created scope", async () => {
    const appConfig = tag(custom<{ env: string }>(), { label: "app.config" });
    const readConfig = flow((context) => {
      return appConfig.get(context.scope);
    });

    const result = await flow.execute(readConfig, undefined, {
      scopeMeta: [appConfig({ env: "production" })],
    });

    expect(result).toEqual({ env: "production" });
  });

  test("execution meta accessible from flow context", async () => {
    const requestId = tag(custom<{ requestId: string }>(), { label: "request.id" });
    const getRequestId = flow((context) => {
      return requestId.get(context);
    });

    const result = await flow.execute(getRequestId, undefined, {
      meta: [requestId({ requestId: "req-123" })],
    });

    expect(result).toEqual({ requestId: "req-123" });
  });

  test("execution meta isolated between concurrent executions", async () => {
    const requestId = tag(custom<{ requestId: string }>(), { label: "request.id" });
    const getRequestId = flow((context) => {
      return requestId.get(context);
    });

    const firstExecution = await flow.execute(getRequestId, undefined, {
      meta: [requestId({ requestId: "req-1" })],
    });
    const secondExecution = await flow.execute(getRequestId, undefined, {
      meta: [requestId({ requestId: "req-2" })],
    });

    expect(firstExecution).toEqual({ requestId: "req-1" });
    expect(secondExecution).toEqual({ requestId: "req-2" });
  });

  test("scopeMeta and execution meta coexist independently", async () => {
    const appConfig = tag(custom<{ env: string }>(), { label: "app.config" });
    const requestId = tag(custom<{ requestId: string }>(), { label: "request.id" });
    const readBothMetas = flow((context) => {
      const scopeConfig = appConfig.get(context.scope);
      const execTag = requestId.get(context);
      return { scope: scopeConfig, exec: execTag };
    });

    const result = await flow.execute(readBothMetas, undefined, {
      scopeMeta: [appConfig({ env: "test" })],
      meta: [requestId({ requestId: "req-abc" })],
    });

    expect(result).toEqual({
      scope: { env: "test" },
      exec: { requestId: "req-abc" },
    });
  });

  test("execution meta does not pollute provided scope", async () => {
    const { createScope } = await import("../src/scope");
    const requestId = tag(custom<{ requestId: string }>(), { label: "request.id" });
    const existingScope = createScope();

    const inspectScope = flow((context) => {
      const scopeMetas = context.scope.metas;
      const execTag = requestId.get(context);
      return { scopeMetas, execTag };
    });

    const result = await flow.execute(inspectScope, undefined, {
      scope: existingScope,
      meta: [requestId({ requestId: "req-xyz" })],
    });

    expect(result.scopeMetas).toBeUndefined();
    expect(result.execTag).toEqual({ requestId: "req-xyz" });
  });
});
