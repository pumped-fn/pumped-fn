import {
  type StandardSchemaV1,
  type Meta,
  type Core,
  provide,
  isExecutor,
  derive,
} from "@pumped-fn/core-next";

export declare namespace Def {
  export interface API<I, O> extends Record<string | symbol, unknown> {
    readonly input: StandardSchemaV1<I>;
    readonly output: StandardSchemaV1<O>;
  }

  export interface Stream<MI, MO, I, O> extends API<I, O> {
    readonly messageIn: StandardSchemaV1<MI>;
    readonly messageOut: StandardSchemaV1<MO>;
  }

  export type AnyAPI = API<unknown, unknown>;
  export type Service = Record<string, API<unknown, unknown>>;
}

export declare namespace Impl {
  export interface API<S extends Def.Service, K extends keyof S, Context> {
    service: S;
    path: K;
    def: S[K];
    context: StandardSchemaV1<Context> | undefined;

    handler: (input: {
      context: Context;
      input: StandardSchemaV1.InferInput<S[K]["input"]>;
    }) =>
      | StandardSchemaV1.InferOutput<S[K]["output"]>
      | Promise<StandardSchemaV1.InferOutput<S[K]["output"]>>;
  }
}

export const define = {
  api<I, O>(api: Def.API<I, O>): typeof api {
    return api;
  },
  stream<MI, MO, I, O>(stream: Def.Stream<MI, MO, I, O>): typeof stream {
    return stream;
  },
  service<Service extends Record<string, Def.AnyAPI>>(
    service: Service
  ): Service {
    return service;
  },
} as const;

class Builder<Service extends Def.Service, Context = undefined> {
  private _context: StandardSchemaV1<unknown> | undefined;
  private _service: Service;
  private _metas: Meta.Meta[] = [];

  constructor(service: Service, ...metas: Meta.Meta[]) {
    this._service = service;
    this._metas = metas;
  }

  context<UpdatedContext>(contextSchema: StandardSchemaV1<UpdatedContext>) {
    this._context = contextSchema;
    return this as unknown as Omit<Builder<Service, UpdatedContext>, "context">;
  }

  implements<P extends keyof Service>(
    path: P,
    handler:
      | Impl.API<Service, P, Context>["handler"]
      | Core.Executor<Impl.API<Service, P, Context>["handler"]>,
    ...metas: Meta.Meta[]
  ): Core.Executor<Impl.API<Service, P, Context>> {
    if (this._service === undefined) {
      throw new Error("Service is not defined");
    }

    const def = this._service[path];

    if (def === undefined) {
      throw new Error(`API ${String(path)} is not defined`);
    }

    if (isExecutor(handler)) {
      return derive(
        handler,
        (handler) => ({
          path,
          service: this._service,
          context: this._context as any,
          handler,
          input: def.input,
          output: def.output,
          def: this._service[path],
        }),
        ...this._metas,
        ...metas
      );
    }

    return provide(
      () => ({
        context: this._context as any,
        handler,
        input: def.input,
        output: def.output,
        service: this._service,
        path,
        def: this._service[path],
      }),
      ...this._metas,
      ...metas
    );
  }
}

export const impl = {
  service<S extends Def.Service>(def: S): Builder<S> {
    return new Builder(def);
  },
};
