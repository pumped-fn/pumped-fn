import { provide, type Executor } from "@pumped-fn/core";
import type { BunRequest } from "bun";
import { getMethod, getPrefix } from "../meta/http";
import {
	createCaller,
	createCallerContext,
	createRequestHandler,
	type Route,
} from "../server";
import { validateInput } from "../standardschema";

export const contextSymbol = Symbol.for("@pumped-fn.context.bun");

export type BunContext = {
	[contextSymbol]: {
		request: BunRequest;
		bunRequest: BunRequest;
	};
};

export const isBunContext = (ctx: unknown): ctx is BunContext => {
	return typeof ctx === "object" && ctx !== null && contextSymbol in ctx;
};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function createBunContext(request: BunRequest<any>): BunContext {
	return {
		[contextSymbol]: { request, bunRequest: request },
	};
}

export const bunRequestHandler = createRequestHandler(
	async ({ definition, handler }, rawContext) => {
		if (!isBunContext(rawContext)) {
			throw new Error("Invalid context");
		}

		const { request } = rawContext[contextSymbol];

		const body = request.body ? await request.json() : undefined;

		const data = await validateInput(definition.input, body);
		const callerContext = createCallerContext(data);

		const result = await handler(callerContext);
		return await validateInput(definition.output, result);
	},
);

type Method = "GET" | "POST" | "PUT" | "DELETE";

type BunRoute = Record<
	Method,
	(req: BunRequest) => Response | Promise<Response>
>;
type BunHandler = Record<string, BunRoute>;

export const toBunHandlers = (
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	...routes: Executor<Route<any>>[]
): Executor<BunHandler> => {
	return provide(routes, async (routes) => {
		const handlers: BunHandler = {};
		for (const { meta: routeMeta, implementations } of routes) {
			const defaultRouteMethod = (await getMethod(routeMeta)) ?? "GET";
			const defaultPrefix = (await getPrefix(routeMeta)) ?? "";

			for (const key in implementations) {
				const { meta: handlerMeta, handler, definition } = implementations[key];
				const routeMethod =
					(await getMethod(handlerMeta)) ?? defaultRouteMethod;
				const prefix = (await getPrefix(handlerMeta)) ?? defaultPrefix;

				const path = `${prefix}/${key}`;
				const bunRoute = handlers[path] ?? ({} as BunRoute);
				handlers[path] = bunRoute;

				bunRoute[routeMethod] = async (req: BunRequest) => {
					const context = createBunContext(req);
					const caller = createCaller(implementations[key], bunRequestHandler);
					const result = await caller(context);

					if (result) {
						const response = new Response(JSON.stringify(result), {
							headers: {
								"Content-Type": "application/json",
							},
						});

						return response;
					}

					return new Response(null, { status: 204 });
				};
			}
		}
		return handlers;
	});
};
