import { vi, test, expect } from "vitest";
import { define, impl, routes } from "../src";
import { client } from "../src/client";
import {
  createScope,
  provide,
  validate,
  custom,
  derive,
  meta,
  resolves,
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

const contextMeta = custom<{ id: string }>();

let count = 0;

const fn = vi.fn();
const logger = impl.middleware<{ id: string }>(async (context, next) => {
  const start = Date.now();
  fn(count++);
  const result = await next(context);
  const end = Date.now();
  fn(count++);

  return result;
});

const fn2 = vi.fn();
const logger2 = impl.middleware(async (context, next) => {
  const start = Date.now();
  fn2(count++);
  const result = await next(context);
  const end = Date.now();
  fn2(count++);

  return result;
});

test("server syntax", async () => {
  const builder = impl.service(rpc).context(contextMeta).use(logger);

  const helloAPI = builder.implements(
    "hello",
    provide(() => () => "hello")
  );

  const countAPI = builder.implements(
    "count",
    ({ input }) => input.length,
    logger2
  );

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
  expect(fn).toHaveBeenCalledTimes(2);

  // execution order
  expect(fn2).toHaveBeenCalledTimes(2);
  expect(fn2.mock.calls[0][0]).toBe(0);
  expect(fn.mock.calls[0][0]).toBe(1);
  expect(fn.mock.calls[1][0]).toBe(2);
  expect(fn2.mock.calls[1][0]).toBe(3);
});

test("router syntax", async () => {
  const fn = vi.fn();
  const routeMiddleware = routes.middleware(async (request, next) => {
    const start = Date.now();
    fn();
    const result = await next();
    const end = Date.now();
    fn();
    console.log(`Request processed in ${end - start}ms`);
    return result;
  });

  const r = routes.router({
    hello: (request) => Response.json({ message: "Hello" }),
    count: routes.compose(
      routes.route((request) => {
        const url = new URL(request.url);
        const count = parseInt(url.searchParams.get("count") || "0", 10);
        return Response.json({ count });
      }),
      routeMiddleware
    ),
  });

  const scope = createScope();

  const router = await resolves(scope, r);

  const request = new Request("http://localhost/hello");
  const response = await router.count(request);

  expect(fn).toHaveBeenCalledTimes(2);
  expect(await response.json()).toEqual({ count: 0 });
});
