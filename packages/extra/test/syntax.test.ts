import { vi, test, expect } from "vitest";
import { define, impl } from "../src";
import { client } from "../src/client";
import { cast } from "./utils";
import {
  createScope,
  provide,
  validate,
  custom,
  derive,
  meta,
} from "@pumped-fn/core-next";

const rpc = {
  hello: define.api({
    input: custom<void>(),
    output: custom<string>(),
  }),
  count: define.api({
    input: custom<string>(),
    output: custom<number>(),
  }),
};

const name = meta("name", custom<string>());

const contextMeta = cast<{ id: string }>();

test("server syntax", async () => {
  const builder = impl.service(rpc).context(contextMeta);

  const helloAPI = builder.implements(
    "hello",
    provide(() => () => "hello")
  );

  const countAPI = builder.implements("count", ({ input }) => input.length);

  const directCall = derive([helloAPI, countAPI], ([...routes]) => {
    return async (path: string, context: unknown, param: unknown) => {
      const route = routes.find((route) => route.path === path);

      if (!route) {
        throw new Error(`Route ${path} not found`);
      }

      const validatedInput = validate(route.def.input, param);

      if (route.context) {
        const validatedContext = validate(route.context, context);

        return await route.handler({
          context: validatedContext,
          input: validatedInput,
        } as any);
      }

      return await route.handler({ input: validatedInput } as any);
    };
  });

  const clientRequestBuilder = client.createAnyRequestHandler(
    derive(
      directCall,
      (directCall) => async (def: unknown, path: string, param: unknown) => {
        return directCall(path, { id: "1234" }, param);
      }
    )
  );

  const serviceClient = client.createCaller(rpc, clientRequestBuilder);

  const scope = createScope();

  const _client = await scope.resolve(serviceClient);
  const result = await _client("count", "hello");
  expect(result).toBe(5);
});
