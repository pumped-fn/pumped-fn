import { describe, test, expect } from "vitest";
import { flow, createScope } from "../src";
import type { Flow } from "../src";

describe("ctx.exec timeout propagation", () => {
  test("propagates timeout to child flow without journal key", async () => {
    const childFlow = flow(async (ctx: Flow.Context) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return "done";
    });

    const parentFlow = flow(async (ctx: Flow.Context) => {
      return ctx.exec({ flow: childFlow, input: undefined, timeout: 50 });
    });

    const scope = createScope();
    const execution = scope.exec({ flow: parentFlow, input: undefined });

    await expect(execution.result.toPromise()).rejects.toThrow();
  });
});
