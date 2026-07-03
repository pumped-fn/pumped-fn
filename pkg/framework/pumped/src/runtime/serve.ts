import { createScope } from "@pumped-fn/lite"
import { hono } from "@pumped-fn/lite-hono"
import { Hono } from "hono"
import { route } from "../tags"
import type { Manifest, ManifestEntry } from "./manifest"

function resolveRoute(entry: ManifestEntry): { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string } {
  const meta = route.find(entry.flow)
  return {
    method: meta?.method ?? "POST",
    path: meta?.path ?? `/${entry.name}`,
  }
}

export function createServer(manifest: Manifest) {
  const appConfig = manifest.app
  const lite = hono.adapter()
  const scope = createScope({
    extensions: [lite, ...(appConfig?.extensions ?? [])],
    tags: appConfig?.tags,
    presets: appConfig?.presets,
  })

  const app = new Hono<hono.Env>()

  app.use(
    "*",
    lite.middleware({
      tags: (request) => appConfig?.context?.(request) ?? [],
    })
  )

  for (const entry of manifest.entries.filter((entry) => entry.kind === "server")) {
    const { method, path } = resolveRoute(entry)

    app.on(method, path, async (context) => {
      const rawInput =
        method === "GET" ? Object.fromEntries(new URL(context.req.url).searchParams) : await context.req.json()

      return context.json(await context.var.lite.exec({ flow: entry.flow, rawInput }))
    })
  }

  for (const entry of manifest.entries.filter((entry) => entry.kind === "agents")) {
    app.post(`/agents/${entry.name}`, async (context) => {
      const rawInput = await context.req.json()
      return context.json(await context.var.lite.exec({ flow: entry.flow, rawInput }))
    })
  }

  return { app, scope }
}
