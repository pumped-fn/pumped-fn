import type { Lite } from "@pumped-fn/lite"
import { hono } from "@pumped-fn/lite-hono"
import { Hono } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { route } from "../tags"
import { createAppScope } from "./app-scope"
import { normalizeApp, type Manifest, type ManifestEntry } from "./manifest"

function resolveRoute(entry: ManifestEntry): { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string } {
  const meta = route.find(entry.meta ? [entry.meta] : []) ?? route.find(entry.flow!)
  return {
    method: meta?.method ?? "POST",
    path: meta?.path ?? `/${entry.name}`,
  }
}

function queryToInput(searchParams: URLSearchParams): Record<string, string | string[]> {
  const input: Record<string, string | string[]> = {}
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key)
    input[key] = values.length > 1 ? values : (values[0] as string)
  }
  return input
}

const INVALID_JSON = Symbol("invalid-json")

async function readJsonBody(req: { text(): Promise<string> }): Promise<unknown> {
  const raw = await req.text()
  if (raw.trim() === "") return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return INVALID_JSON
  }
}

export interface SharedScope {
  scope: Lite.Scope
  lite: hono.Adapter
}

export function createServer(manifest: Manifest, shared?: SharedScope) {
  const appConfig = normalizeApp(manifest.app)
  const lite = shared?.lite ?? hono.adapter()
  const appScope = shared?.scope ?? createAppScope(manifest, [lite])

  const app = new Hono<hono.Env>()

  app.use(
    "*",
    lite.middleware({
      tags: (request) => appConfig.context(request),
    })
  )

  for (const entry of manifest.entries.filter((entry) => entry.kind === "server")) {
    const { method, path } = resolveRoute(entry)

    app.on(method, path, async (context) => {
      const rawInput =
        method === "GET" ? queryToInput(new URL(context.req.url).searchParams) : await readJsonBody(context.req)

      if (rawInput === INVALID_JSON) return context.json({ error: "invalid JSON body" }, 400)

      try {
        return context.json(await context.var.lite.exec({ flow: entry.flow!, rawInput }))
      } catch (error) {
        const mapped = appConfig.mapError?.(error)
        if (mapped === undefined) throw error
        return context.json(mapped.body, mapped.status as ContentfulStatusCode)
      }
    })
  }

  for (const entry of manifest.entries.filter((entry) => entry.kind === "agents")) {
    app.post(`/agents/${entry.name}`, async (context) => {
      const rawInput = await readJsonBody(context.req)
      if (rawInput === INVALID_JSON) return context.json({ error: "invalid JSON body" }, 400)

      try {
        return context.json(await context.var.lite.exec({ flow: entry.flow!, rawInput }))
      } catch (error) {
        const mapped = appConfig.mapError?.(error)
        if (mapped === undefined) throw error
        return context.json(mapped.body, mapped.status as ContentfulStatusCode)
      }
    })
  }

  return { app, scope: appScope }
}
