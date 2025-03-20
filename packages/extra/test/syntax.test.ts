import { vi, test, expect } from "vitest";
import { define, impl } from "../src";
import { server } from "../src/server";
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
    count: provide(() => (context) => {
      return context.data.length;
    }),
  });

  const directCall = server.createAnyServiceHandler(async (def, path, context) => {
    return await def[path as any].handler({ data: context });
  });

  const serviceCaller = server.createServiceCaller(service, directCall);

  const clientRequestBuilder = client.createAnyRequestHandler(
    provide(serviceCaller, (serviceCaller) => async (def, path, param) => {
      return await serviceCaller(path as any, param);
    }),
  );

  const serviceClient = client.createCaller(rpc, clientRequestBuilder);

  const scope = createScope();

  const result = await safeRun(scope, { serviceCaller, serviceClient }, async ({ serviceCaller, serviceClient }) => {
    return await Promise.all([
      serviceClient("hello"),
      serviceCaller("count", "hello"),
      serviceClient("count", "hello"),
    ]);
  });

  if (result.status === "error") {
    expect.fail(`shouldn't be here`, result.error);
  } else {
    expect(result.value).toEqual([
      {
        kind: "ok",
        value: "hello",
      },
      {
        kind: "ok",
        value: 5,
      },
      {
        kind: "ok",
        value: 5,
      },
    ]);
  }
});
