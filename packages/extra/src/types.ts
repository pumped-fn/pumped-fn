import { type StandardSchemaV1, type Meta, type Executor, InferOutput, isExecutor, provide } from "@pumped-fn/core";

export declare namespace Def {
  export interface API<I, O> extends Record<string | symbol, unknown> {
    readonly input: StandardSchemaV1<I>;
    readonly output: StandardSchemaV1<O>;
    readonly metas?: Meta<unknown>[];
  }

  export interface Stream<MI, MO, I, O> extends API<I, O> {
    readonly messageIn: StandardSchemaV1<MI>;
    readonly messageOut: StandardSchemaV1<MO>;
  }

  export type AnyAPI = API<unknown, unknown>;

  export type Service = Record<string, AnyAPI> & {
    readonly metas?: Meta<unknown>[];
  };
}

export declare namespace Impl {
  export interface API<
    S extends Def.Service,
    Key extends keyof S,
    Context,
    I extends StandardSchemaV1.InferInput<S[Key]["input"]> = StandardSchemaV1.InferInput<S[Key]["input"]>,
    O extends StandardSchemaV1.InferOutput<S[Key]["output"]> = StandardSchemaV1.InferOutput<S[Key]["output"]>,
  > extends Def.API<I, O> {
    def: S;
    path: Key;
    handler: (context: Context, param: I) => O | Promise<O>;
    context?: StandardSchemaV1<Context>;
  }

  export type AnyAPI = API<any, any, any, any>;
}

export const define = {
  api<I, O>(api: Def.API<I, O>): typeof api {
    return api;
  },
  stream<MI, MO, I, O>(stream: Def.Stream<MI, MO, I, O>): typeof stream {
    return stream;
  },
  service<Service extends Record<string, Def.AnyAPI>>(service: Service) {
    return service;
  },
} as const;

export const impl = {
  api<S extends Def.Service, K extends keyof S, Context>(
    service: S,
    path: K,
    context: StandardSchemaV1<Context>,
    handler: Impl.API<S, K, Context>["handler"] | Executor<Impl.API<S, K, Context>["handler"]>,
    ...metas: Meta[]
  ): Executor<Impl.API<S, K, Context>> {
    if (isExecutor(handler)) {
      return provide(
        handler,
        (handler) => ({
          def: service,
          path,
          handler,
          context,
          input: service[path].input,
          output: service[path].output,
        }),
        ...metas,
      );
    }

    return provide(
      () => ({
        def: service,
        path,
        handler,
        context,
        input: service[path].input,
        output: service[path].output,
      }),
      ...metas,
    );
  },
};
