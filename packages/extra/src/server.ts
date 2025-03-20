import { Executor, isExecutor, type Meta, provide, type StandardSchemaV1 } from "@pumped-fn/core";
import type { Context, Impl } from "./types";
import { type Result, results } from "./results";

export declare namespace Server {
  export type AnyServiceHandler = (def: Impl.AnyService, path: unknown, rawContext: unknown) => unknown;

  export type ServiceCaller<S extends Impl.AnyService> = <K extends keyof S>(
    path: K,
    rawContext: unknown,
  ) => Promise<Result<StandardSchemaV1.InferOutput<S[K]["output"]>>>;
}

export const server = {
  createCallerContext<T>(data: T, ...extended: Record<string, unknown>[]): Context<T> {
    const callerContext = {} as Context<T>;
    Object.defineProperty(callerContext, "data", {
      value: data,
      writable: false,
      configurable: false,
      enumerable: true,
    });

    for (const [key, value] of Object.entries(extended)) {
      Object.assign(callerContext, { [key]: value });
    }

    return callerContext;
  },

  createAnyServiceHandler(
    handler: Executor<Server.AnyServiceHandler> | Server.AnyServiceHandler,
    ...metas: Meta[]
  ): Executor<Server.AnyServiceHandler> {
    if (isExecutor(handler)) {
      return handler;
    }

    return provide(() => handler, ...metas);
  },

  createServiceCaller<S extends Impl.AnyService>(
    pservice: Executor<S> | S,
    phandler: Executor<Server.AnyServiceHandler> | Server.AnyServiceHandler,
    ...metas: Meta[]
  ): Executor<Server.ServiceCaller<S>> {
    const handler = isExecutor(phandler) ? phandler : provide(() => phandler);
    const service = isExecutor(pservice) ? pservice : provide(() => pservice);

    return provide(
      { service, handler },
      ({ service, handler }) =>
        async (path, rawContext) => {
          return await results.toResult(async () => await handler(service, path, rawContext));
        },
      ...metas,
    );
  },
};
