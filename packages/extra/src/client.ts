import type { Def } from "./types";
import { type Core, derive, isExecutor, provide } from "@pumped-fn/core-next";
import type { Meta, StandardSchemaV1 } from "@pumped-fn/core-next";

export declare namespace Client {
  export type RequestHandler<S extends Def.Service> = <K extends keyof S>(
    def: S,
    path: K,
    param: StandardSchemaV1.InferInput<S[K]["input"]>
  ) => Promise<StandardSchemaV1.InferOutput<S[K]["output"]>>;

  export type ServiceCaller<S extends Def.Service> = <
    K extends keyof S,
    P extends StandardSchemaV1.InferInput<S[K]["input"]>,
    Params extends P extends void | undefined ? [] : [P]
  >(
    path: K,
    ...params: Params
  ) => Promise<StandardSchemaV1.InferOutput<S[K]["output"]>>;
}

export const client = {
  createAnyRequestHandler(
    handler:
      | Core.Executor<Client.RequestHandler<Def.Service>>
      | Client.RequestHandler<Def.Service>,
    ...metas: Meta.Meta[]
  ): Core.Executor<Client.RequestHandler<Def.Service>> {
    if (isExecutor(handler)) {
      return handler;
    }

    return provide(() => handler, ...metas);
  },
  createCaller<D extends Def.Service>(
    def: D,
    phandler:
      | Core.Executor<Client.RequestHandler<Def.Service>>
      | Client.RequestHandler<Def.Service>,
    ...metas: Meta.Meta[]
  ): Core.Executor<Client.ServiceCaller<D>> {
    const handler = isExecutor(phandler) ? phandler : provide(() => phandler);

    return derive(
      handler,
      async (handler) => {
        return async (path, ...params) =>
          handler(
            def,
            path as any,
            params.length === 1 ? params[0] : undefined
          );
      },
      ...metas
    );
  },
};
