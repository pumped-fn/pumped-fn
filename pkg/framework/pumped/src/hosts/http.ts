import { atom, FlowFault, ParseError, tags, type Lite } from "@pumped-fn/lite"
import type { Entry } from "../entry"
import type { Manifest } from "../runtime/manifest"
import { httpError, httpRequest, httpResponse, route, type HttpResponseCarrier, type RouteSpec } from "../tags"
import { HostStartError, selectEntries, type Host, type HostRuntime } from "./host"

const INVALID_JSON = Symbol("invalid-json")

function queryToInput(searchParams: URLSearchParams): Record<string, string | string[]> {
  const input: Record<string, string | string[]> = {}
  for (const [key, value] of searchParams) {
    const existing = input[key]
    if (existing === undefined) input[key] = value
    else if (Array.isArray(existing)) existing.push(value)
    else input[key] = [existing, value]
  }
  return input
}

async function readJsonBody(request: Request): Promise<unknown> {
  const raw = await request.text()
  if (raw.trim() === "") return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return INVALID_JSON
  }
}

async function readInput(
  spec: RouteSpec,
  request: Request,
  params: Record<string, string>
): Promise<unknown> {
  if (spec.method === "GET") {
    return { ...queryToInput(new URL(request.url).searchParams), ...params }
  }
  const body = await readJsonBody(request)
  if (body === INVALID_JSON) return INVALID_JSON
  if (body === undefined) return Object.keys(params).length > 0 ? params : undefined
  if (typeof body === "object" && body !== null && !Array.isArray(body)) return { ...body, ...params }
  return body
}

function errorResponse(body: unknown, status: number, carrier: HttpResponseCarrier): Response {
  const headers = new Headers(carrier.headers)
  headers.set("content-type", "application/json")
  return new Response(JSON.stringify(body), { status, headers })
}

function render(output: unknown, carrier: HttpResponseCarrier): Response {
  if (carrier.body !== undefined) {
    return new Response(carrier.body, { status: carrier.status ?? 200, headers: carrier.headers })
  }
  if (output === undefined) {
    return new Response(null, { status: carrier.status ?? 204, headers: carrier.headers })
  }
  if (!carrier.headers.has("content-type")) carrier.headers.set("content-type", "application/json")
  return new Response(JSON.stringify(output), { status: carrier.status ?? 200, headers: carrier.headers })
}

export interface HttpRuntime extends HostRuntime {
  fetch(request: Request): Promise<Response>
}

interface MountedRoute {
  spec: RouteSpec
  handle(request: Request, params: Record<string, string>): Promise<Response>
}

export const httpHost: Host<RouteSpec, { port?: number }, HttpRuntime> = Object.freeze({
  name: "http",
  selector: route,
  provides: Object.freeze([httpRequest, httpResponse]),
  start({ scope, manifest, port }: { scope: Lite.Scope; manifest: Manifest; port?: number }): HttpRuntime {
    const selections = selectEntries(manifest, route)
    const fallbackMapper = scope.resolve(
      atom({ deps: { mapper: tags.optional(httpError) }, factory: (_ctx, { mapper }) => mapper })
    )
    const bundleDeps: Record<string, Entry<any, any>> = Object.fromEntries(
      selections.map((selection, index) => [`entry${index}`, selection.entry])
    )
    const bundles = scope.resolve(atom({ deps: bundleDeps, factory: (_ctx, deps) => deps }))

    const routes: MountedRoute[] = []
    const mounted = new Map<string, string>()

    selections.forEach((selection, index) => {
      for (const mount of selection.mounts) {
        const key = `${mount.spec.method} ${mount.spec.path}`
        const existing = mounted.get(key)
        if (existing) {
          throw new HostStartError("duplicate-route", `duplicate route ${key}: ${existing}, ${selection.name}`)
        }
        mounted.set(key, selection.name)

        routes.push({
          spec: mount.spec,
          handle: async (request, params) => {
            const rawInput = await readInput(mount.spec, request, params)
            const carrier: HttpResponseCarrier = { headers: new Headers() }
            if (rawInput === INVALID_JSON) return errorResponse({ error: "invalid JSON body" }, 400, carrier)

            const mapper = httpError.find(selection.tags) ?? (await fallbackMapper)
            const bundle = (await bundles)[`entry${index}`]!

            let output: unknown
            try {
              output = await scope.run({
                flow: bundle.flow,
                rawInput,
                tags: [httpRequest(request), httpResponse(carrier), mount.tagged, selection.tags],
              })
            } catch (error) {
              const mapped = mapper?.(error)
              if (mapped) return errorResponse(mapped.body, mapped.status, carrier)
              if (error instanceof ParseError) return errorResponse({ error: error.message }, 400, carrier)
              if (error instanceof FlowFault) return errorResponse({ fault: error.fault }, 422, carrier)
              throw error
            }
            try {
              return render(output, carrier)
            } catch (error) {
              return errorResponse(
                { error: `response body is not serializable: ${error instanceof Error ? error.message : String(error)}` },
                500,
                carrier
              )
            }
          },
        })
      }
    })

    const node = atom({
      factory: async (ctx) => {
        const { Hono } = await import("hono")
        const app = new Hono()
        for (const { spec, handle } of routes) {
          app.on(spec.method, spec.path, (context) => handle(context.req.raw, context.req.param()))
        }

        const fetch = (request: Request) => Promise.resolve(app.fetch(request))

        if (port !== undefined) {
          const { serve } = await import("@hono/node-server")
          const server = serve({ fetch: app.fetch, port })
          ctx.cleanup(
            (target) =>
              new Promise<void>((resolve, reject) => target.close((error) => (error ? reject(error) : resolve()))),
            server
          )
        }

        return { fetch }
      },
    })

    const resolved = scope.resolve(node)
    return {
      ready: resolved.then(() => undefined),
      stop: async () => {
        await resolved.catch(() => undefined)
        await scope.release(node)
      },
      fetch: async (request: Request) => (await resolved).fetch(request),
    }
  },
})
