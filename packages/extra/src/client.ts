import type { Def } from "./types";
import { type Executor, provide } from "@pumped-fn/core";
import type { StandardSchemaV1 } from "@pumped-fn/core";

export declare namespace Client {
  export type RequestHandler<S extends Def.Service, K extends keyof S> = (
    def: S,
    path: K,
    param: StandardSchemaV1.InferInput<S[K]["input"]>,
  ) => Promise<StandardSchemaV1.InferOutput<S[K]["output"]>>;

  export type ServiceCaller<S extends Def.Service> = <
    K extends keyof S,
    P extends StandardSchemaV1.InferInput<S[K]["input"]>,
    Params extends P extends void | undefined ? [] : [P],
  >(
    path: K,
    ...params: Params
  ) => Promise<StandardSchemaV1.InferOutput<S[K]["output"]>>;
}

export const client = {
  createAnyRequestHandler(
    handler: Executor<Client.RequestHandler<Def.Service, string>>,
  ): Executor<Client.RequestHandler<Def.Service, string>> {
    return handler;
  },
  createCaller<D extends Def.Service>(
    def: D,
    handler: Executor<Client.RequestHandler<Def.Service, string>>,
  ): Executor<Client.ServiceCaller<D>> {
    return provide(handler, async (handler) => {
      return async (path, ...params) => handler(def, path as any, params.length === 1 ? params[0] : undefined);
    });
  },
};
