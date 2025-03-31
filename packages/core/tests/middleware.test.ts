import { describe, it, expect } from "vitest";
import { Middleware } from "../src/types";
import { createScope } from "../src/core";
import { provide } from "../src/fns/immutable";
import { registerMiddlewares, resolveOnce } from "../src/statics";

describe("middleware runway", () => {
  it("middleware can change the behavior", async () => {
    const scope = createScope();

    const loggingMiddleware: Middleware = {
      onResolve: async (scope, executor, resolvedValue) => {
        Object.defineProperty(resolvedValue, "$test", {
          value: "test",
        });
        return resolvedValue;
      },
    };

    const value = provide(() => ({
      value: 100,
    }));

    registerMiddlewares(scope, loggingMiddleware);
    const resolvedValue = await resolveOnce(scope, value);
    expect(resolvedValue).toMatchObject({ $test: "test" });
  });
});
