import { type StandardSchemaV1, type Meta, type Executor, provide } from "@pumped-fn/core";

export interface Context<I = unknown> extends Record<string, unknown> {
  readonly data: Awaited<I>;
}

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
    I extends StandardSchemaV1.InferInput<S[Key]["input"]> = StandardSchemaV1.InferInput<S[Key]["input"]>,
    O extends StandardSchemaV1.InferOutput<S[Key]["output"]> = StandardSchemaV1.InferOutput<S[Key]["output"]>,
  > extends Def.API<I, O> {
    def: S;
    id: Key;
    handler: (context: Context<I>) => O | Promise<O>;
  }

  export type AnyAPI = API<any, any, any, any>;

  export type Service<S extends Def.Service> = {
    [K in keyof S]: API<S, K>;
  };

  export type AnyService = Service<any>;
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
  api<S extends Def.Service, K extends keyof S>(
    service: S,
    path: K,
    impl: Executor<Impl.API<S, K>["handler"]>,
  ): Executor<Impl.API<S, K>> {
    return provide(impl, (impl) => ({
      id: path,
      def: service,
      handler: impl,
      input: service[path]["input"],
      output: service[path]["output"],
    }));
  },
  service<S extends Def.Service>(
    service: S,
    impls: {
      [K in keyof S]: Executor<Impl.API<S, K> | Impl.API<S, K>["handler"]>;
    },
  ): Executor<Impl.Service<S>> {
    return provide(impls, (impls) => {
      const result = {} as Impl.Service<S>;

      for (const key in service) {
        const impl = (impls as Record<keyof S, Impl.API<S, keyof S> | Impl.API<S, keyof S>["handler"]>)[key];

        if (typeof impl === "function") {
          result[key] = {
            id: key,
            def: service,
            handler: impl,
            input: service[key]["input"],
            output: service[key]["output"],
          };
        } else {
          result[key] = impl as any;
        }
      }

      return result;
    });
  },
};
