import { vi, test, expect } from "vitest";
import { define, impl } from "../src";
import { client } from "../src/client";
import { cast } from "./utils";
import { createScope, provide, run, validateInput, safeRun } from "@pumped-fn/core";

const rpc = define.service({
  hello: {
    input: cast<undefined>(),
    output: cast<string>(),
  },
  count: {
    input: cast<string>(),
    output: cast<number>(),
  },
});

const contextMeta = cast<{ id: string }>();

test("server syntax", async () => {
  const helloAPI = impl.api(
    rpc,
    "hello",
    contextMeta,
    provide(() => () => {
      return "hello";
    }),
  );

  const countAPI = impl.api(
    rpc,
    "count",
    contextMeta,
    provide(() => (_, word) => {
      return word.length;
    }),
  );

  const directCall = provide([helloAPI, countAPI], ([...routes]) => {
    return async (path: string, context: unknown, param: unknown) => {
      const route = routes.find((route) => route.path === path);

      if (!route) {
        throw new Error(`Route ${path} not found`);
      }

      const validatedInput = validateInput(route.input, param);

      if (route.context) {
        const validatedContext = validateInput(route.context, context);

        return await route.handler(validatedContext, validatedInput as never);
      }

      return await route.handler(undefined as any, validatedInput as never);
    };
  });

  const clientRequestBuilder = client.createAnyRequestHandler(
    provide(directCall, (directCall) => async (def: unknown, path: string, param: unknown) => {
      return directCall(path, { id: "1234" }, param);
    }),
  );

  const serviceClient = client.createCaller(rpc, clientRequestBuilder);

  const scope = createScope();

  const result = await safeRun(scope, { directCall, serviceClient }, async ({ directCall, serviceClient }) => {
    return await Promise.all([
      serviceClient("hello"),
      directCall("count", { id: "1234" }, "hello"),
      serviceClient("count", "hello"),
    ]);
  });

  if (result.status === "error") {
    expect.fail(`shouldn't be here`, result.error);
  } else {
    expect(result.value).toEqual(["hello", 5, 5]);
  }
});
