import { provide, type Executor } from "@pumped-fn/core";
import type { StandardSchemaV1 } from "./standardschema";
import type { AnyAPI, Service } from "./types";
import type { Meta } from "./meta";

export interface Context<I = unknown> extends Record<string, unknown> {
	readonly data: Awaited<I>;
}

export function createCallerContext<T>(
	data: T,
	...extended: Record<string, unknown>[]
): Context<T> {
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
}

export type RequestHandler = (
	def: AnyImplementation,
	rawContext: unknown,
) => Promise<unknown>;

export function createRequestHandler(handler: RequestHandler): RequestHandler {
	return handler;
}

export function createCaller(
	def: AnyImplementation,
	implementation: RequestHandler,
): (rawContext: Record<string, unknown>) => Promise<unknown> {
	return (rawContext) => implementation(def, rawContext);
}

export function createRouteCaller<S extends Service, K extends keyof S>(
	route: Route<S>,
	path: K,
	handler: RequestHandler,
): (rawContext: Record<string, unknown>) => Promise<unknown> {
	const implementation = route.implementations[path] as AnyImplementation;
	return createCaller(implementation, handler);
}

export type Handler<I, O> = (param: Context<I>) => Promise<O> | O;

export type Implementation<S extends Service, P extends keyof S> = {
	definition: S[P];
	id: P;
	handler: Handler<
		StandardSchemaV1.InferInput<S[P]["input"]>,
		StandardSchemaV1.InferOutput<S[P]["output"]>
	>;
	meta: Meta<symbol, unknown>[];
};

export type AnyImplementation = Implementation<Service, keyof Service>;

export type Route<S extends Service> = {
	service: S;
	implementations: { [K in keyof S]: Implementation<S, K> };
	meta: Meta<symbol, unknown>[];
};

export function implement<SE extends Service, S extends keyof SE>(
	service: SE,
	path: S,
	meta: Meta<symbol, unknown>[],
	fn: Executor<
		Handler<
			StandardSchemaV1.InferInput<SE[S]["input"]>,
			StandardSchemaV1.InferOutput<SE[S]["output"]>
		>
	>,
): Executor<Implementation<SE, S>>;

export function implement<SE extends Service, S extends keyof SE>(
	service: SE,
	path: S,
	fn: Executor<
		Handler<
			StandardSchemaV1.InferInput<SE[S]["input"]>,
			StandardSchemaV1.InferOutput<SE[S]["output"]>
		>
	>,
): Executor<Implementation<SE, S>>;

export function implement<
	Service extends Record<string, AnyAPI>,
	S extends keyof Service,
>(
	service: Service,
	path: S,
	metaOrFn:
		| Meta<symbol, unknown>[]
		| Executor<
				Handler<
					StandardSchemaV1.InferInput<Service[S]["input"]>,
					StandardSchemaV1.InferOutput<Service[S]["output"]>
				>
		  >,
	pfn?: Executor<
		Handler<
			StandardSchemaV1.InferInput<Service[S]["input"]>,
			StandardSchemaV1.InferOutput<Service[S]["output"]>
		>
	>,
): Executor<Implementation<Service, S>> {
	const meta = Array.isArray(metaOrFn) ? metaOrFn : [];
	const fn = Array.isArray(metaOrFn) ? pfn : metaOrFn;

	if (!fn) {
		throw new Error("Handler function is required");
	}

	return provide([fn], ([fn]) => {
		return {
			id: path,
			handler: fn,
			definition: service[path],
			meta,
		};
	});
}

export type AnyRoute = Route<Service>;

export function route<
	S extends Service,
	I extends { [K in keyof S]: Executor<Implementation<S, K>> },
>(
	service: S,
	implementations: I,
	...meta: Meta<symbol, unknown>[]
): Executor<Route<S>> {
	return provide(
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		implementations as any,
		(implementations) => ({
			implementations,
			meta,
			service,
		}),
	) as unknown as Executor<Route<S>>;
}
