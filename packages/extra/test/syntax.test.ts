import { vi, test, expect } from "vitest";
import { define, impl } from "../src";
import { client } from "../src/client";
import { cast } from "./utils";
import { createScope, provide, run, safeRun } from "@pumped-fn/core";

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

test("server syntax", async () => {
  const helloHandler = impl.api(
    rpc,
    "hello",
    provide(() => (context) => {
      return "hello";
    }),
  );

  const service = impl.service(rpc, {
    hello: helloHandler,
    count: provide(() => (input) => {
      return input.length;
    }),
  });

  const directCall = provide(service, (service) => {
    return async (path: string, ...params: unknown[]) => {
      return await service[path].handler(params.at(0) as any);
    };
  });

  const clientRequestBuilder = client.createAnyRequestHandler(
    provide(directCall, (directCall) => async (def, path, param) => {
      return directCall(path, param) as any;
    }),
  );

  const serviceClient = client.createCaller(rpc, clientRequestBuilder);

  const scope = createScope();

  const result = await safeRun(scope, { directCall, serviceClient }, async ({ directCall, serviceClient }) => {
    return await Promise.all([serviceClient("hello"), directCall("count", "hello"), serviceClient("count", "hello")]);
  });

  if (result.status === "error") {
    expect.fail(`shouldn't be here`, result.error);
  } else {
    expect(result.value).toEqual(["hello", 5, 5]);
  }
});
