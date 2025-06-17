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

  export type Middleware<Context> = (
    input: { context: Context; input: unknown },
    next: (input: { context: Context; input: unknown }) => Promise<unknown>
  ) => Promise<unknown>;
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
  protected _context: StandardSchemaV1<unknown> | undefined;
  protected _service: Service;
  protected _middlewares: Core.Executor<Impl.Middleware<Context>>[] = [];
  protected _metas: Meta.Meta[] = [];

  constructor(service: Service, ...metas: Meta.Meta[]) {
    this._service = service;
    this._metas = metas;
  }

  clone(): Builder<Service, Context> {
    const clone = new Builder<Service, Context>(this._service, ...this._metas);
    clone._context = this._context;
    clone._middlewares = [...this._middlewares];
    return clone;
  }

  context<UpdatedContext>(
    contextSchema: StandardSchemaV1<UpdatedContext>
  ): Omit<Builder<Service, UpdatedContext>, "context"> {
    this._context = contextSchema;
    return this as unknown as Omit<Builder<Service, UpdatedContext>, "context">;
  }

  use(
    middleware:
      | Impl.Middleware<Context>
      | Core.Executor<Impl.Middleware<Context>>
  ): this {
    this._middlewares.push(
      isExecutor(middleware) ? middleware : provide(() => middleware)
    );
    return this.clone() as any;
  }

  implements<P extends keyof Service>(
    path: P,
    phandler:
      | Impl.API<Service, P, Context>["handler"]
      | Core.Executor<Impl.API<Service, P, Context>["handler"]>,
    ...additionalMiddlewares: Core.Executor<Impl.Middleware<Context>>[]
  ): Core.Executor<Impl.API<Service, P, Context>> {
    if (this._service === undefined) {
      throw new Error("Service is not defined");
    }

    const def = this._service[path];

    if (def === undefined) {
      throw new Error(`API ${String(path)} is not defined`);
    }

    const handler = isExecutor(phandler) ? phandler : provide(() => phandler);
    const middlewares = [...additionalMiddlewares, ...this._middlewares];

    return derive(
      [handler, ...middlewares],
      ([handler, ...middlewares]) => ({
        path,
        service: this._service,
        context: this._context as any,
        handler: async (context) => {
          let next: Impl.Middleware<Context> = (context) =>
            handler(context) as any;

          for (const middleware of middlewares.reverse()) {
            const current = next;
            next = (input) => {
              return middleware(input, current as any);
            };
          }

          return await (next as any)(context);
        },

        input: def.input,
        output: def.output,
        def: this._service[path],
      }),
      ...this._metas
    );
  }
}

export declare namespace Router {
  export type RouteFn<R extends Request> = (
    request: R
  ) => Promise<Response> | Response;

  export type Route<R extends Request> = Core.Executor<RouteFn<R>>;

  export type RouterInput<R extends Request> = Record<string, Route<R> | RouteFn<R>>;
  export type Router< R extends Request> = Record<string, Route<R>>;

  export type MiddlewareFn<R extends Request> = (
    request: R,
    next: () => Response | Promise<Response>
  ) => Promise<Response> | Response;

  export type Middleware<R extends Request> = Core.Executor<MiddlewareFn<R>>;
}

export const routes = {
  router: <R extends Request>(router: Router.RouterInput<R>): Router.Router<R> => {
    const _router: Router.Router<R> = {}
    for (const key in router) {
      if (!isExecutor(router[key])) {
        Object.assign(_router, { [key]: provide(() => router[key]) });
      }
      else {
        Object.assign(_router, { [key]: router[key] });
      }
    }
    return _router;
  },
  route: <R extends Request>(rawRoute: Router.RouteFn<R>): Router.Route<R> => {
    return provide(() => rawRoute);
  },

  pipe: <R extends Request>(
    route: Router.Route<R>,
    ...middlewares: Router.Middleware<R>[]
  ) => {
    return derive([route, ...middlewares], ([route, ...middlewares]) => {
      return async (request: R) => {
        let next: () => Response | Promise<Response> = () => route(request);

        for (const middleware of middlewares.reverse()) {
          const current = next;
          next = () => middleware(request, current);
        }

        return await next();
      };
    });
  },
  compose: <R extends Request>(
    route: Router.Route<R>,
    ...middlewares: Router.Middleware<R>[]
  ) => routes.pipe(route, ...middlewares.reverse()),
  middleware: <R extends Request>(
    middleware: Router.MiddlewareFn<R> | Core.Executor<Router.MiddlewareFn<R>>
  ): Router.Middleware<R> => {
    return isExecutor(middleware) ? middleware : provide(() => middleware);
  },
};

export const impl = {
  service<S extends Def.Service>(def: S): Builder<S> {
    return new Builder(def);
  },
  middleware: <C = any>(
    m: Impl.Middleware<C> | Core.Executor<Impl.Middleware<C>>
  ): Core.Executor<Impl.Middleware<C>> =>
    isExecutor(m) ? m : provide(() => m),
};
