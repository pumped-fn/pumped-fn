import type { Plugin, ViteDevServer } from "vite"
import { readLite, transformAtoms } from "./transform"
import type { EdgeMeta, HandleMeta, LiteMeta, ModuleMeta } from "./types"

interface ResponseLike {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body: string): void
}

type ResolveImport = (source: string, importer: string) => Promise<string | undefined>

interface ResolveContext {
  resolve(source: string, importer: string, options: { skipSelf: boolean }): Promise<{ id: string } | null>
}

/**
 * Configuration options for the pumped-fn HMR plugin.
 */
export interface PumpedHmrOptions {
  /** File pattern to include in transformation. Defaults to /\.[jt]sx?$/ */
  include?: RegExp
  /** File pattern to exclude from transformation. Defaults to /node_modules/ */
  exclude?: RegExp
}

/**
 * Configuration options for the pumped-fn graph plugin.
 */
export interface PumpedGraphOptions extends PumpedHmrOptions {
  /** Metadata asset file name. Defaults to pumped-fn-lite.json */
  fileName?: string
}

/**
 * Configuration options for the pumped-fn Vite plugin set.
 */
export interface PumpedViteOptions {
  /** HMR and dev metadata options. Pass false to disable the dev plugin. */
  hmr?: PumpedHmrOptions | false
  /** Production graph metadata options. Pass true or options to emit build metadata. */
  graph?: PumpedGraphOptions | boolean
}

export const hmrMetaModule = "virtual:pumped-fn/lite-hmr"
export const hmrMetaPath = "/__pumped-fn/lite-hmr.json"
export const hmrInspectPath = "/__pumped-fn/lite-hmr"
export const graphFileName = "pumped-fn-lite.json"

const resolvedHmrMetaModule = `\0${hmrMetaModule}`

/**
 * Vite plugin set for Lite HMR, dev metadata, and optional production graph metadata.
 */
export function pumpedVite(options: PumpedViteOptions = {}): Plugin[] {
  const plugins: Plugin[] = []
  if (options.hmr !== false) plugins.push(pumpedHmr(options.hmr))
  if (options.graph) plugins.push(pumpedGraph(options.graph === true ? undefined : options.graph))
  return plugins
}

/**
 * Vite plugin that transforms atom declarations for HMR preservation.
 * Automatically disabled in production builds.
 */
export function pumpedHmr(options: PumpedHmrOptions = {}): Plugin {
  const {
    include = /\.[jt]sx?$/,
    exclude = /node_modules/,
  } = options
  const modules = new Map<string, ModuleMeta>()
  let server: ViteDevServer | undefined
  let root = ""

  return {
    name: "pumped-fn-hmr",
    enforce: "pre",
    apply: "serve",

    configResolved(config) {
      root = clean(config.root)
    },

    configureServer(next) {
      server = next
      next.watcher.on("unlink", (file) => {
        void dropAndRefresh(modules, displayId(clean(file), root), server, root)
      })
      next.middlewares.use((req, res, done) => {
        const path = req.url?.split("?")[0]
        if (path === hmrMetaPath) {
          send(res, "application/json; charset=utf-8", JSON.stringify(hmrMeta(modules)))
          return
        }
        if (path === hmrInspectPath) {
          send(res, "text/html; charset=utf-8", inspector())
          return
        }
        done()
      })
    },

    resolveId(id) {
      if (id === hmrMetaModule) return resolvedHmrMetaModule
      return null
    },

    load(id) {
      if (id !== resolvedHmrMetaModule) return null
      const meta = hmrMeta(modules)
      return [
        `export const meta = ${JSON.stringify(meta)};`,
        "export const modules = meta.modules;",
        "export const handles = meta.handles;",
        "export const atoms = meta.atoms;",
        "export const edges = meta.edges;",
        "export const issues = meta.issues;",
      ].join("\n")
    },

    async transform(code, id) {
      const raw = clean(id)
      const key = displayId(raw, root)

      if (!matches(include, raw)) {
        drop(modules, key, server)
        return null
      }

      if (matches(exclude, raw)) {
        drop(modules, key, server)
        return null
      }

      if (!code.includes("@pumped-fn/lite")) {
        drop(modules, key, server)
        return null
      }

      const result = transformAtoms(code, key)
      if (!result) {
        drop(modules, key, server)
        return null
      }

      const meta = await resolveMeta(result.meta, raw, root, (source, importer) => resolveHmrImport(this, server, source, importer))
      set(modules, meta, server)
      return {
        ...result,
        meta,
      }
    },

    async handleHotUpdate(ctx) {
      const raw = clean(ctx.file)
      const key = displayId(raw, root)
      let changed = false

      if (!matches(include, raw) || matches(exclude, raw)) {
        changed = drop(modules, key, ctx.server)
      } else {
        const code = await ctx.read()
        if (!code.includes("@pumped-fn/lite")) {
          changed = drop(modules, key, ctx.server)
        } else {
          const result = transformAtoms(code, key)
          changed = result
            ? set(modules, await resolveMeta(result.meta, raw, root, (source, importer) => resolveServerImport(ctx.server, source, importer)), ctx.server)
            : drop(modules, key, ctx.server)
        }
      }

      changed = await refreshImports(modules, ctx.server, root) || changed
      if (!changed) return
      const mod = metaModule(ctx.server)
      if (!mod) return
      return [...ctx.modules, mod]
    },
  }
}

/**
 * Vite build plugin that emits discovered Lite graph metadata as a JSON asset.
 */
export function pumpedGraph(options: PumpedGraphOptions = {}): Plugin {
  const {
    include = /\.[jt]sx?$/,
    exclude = /node_modules/,
    fileName = graphFileName,
  } = options
  const modules = new Map<string, ModuleMeta>()
  let root = ""

  return {
    name: "pumped-fn-graph",
    enforce: "pre",
    apply: "build",

    configResolved(config) {
      root = clean(config.root)
    },

    async transform(code, id) {
      const raw = clean(id)
      const key = displayId(raw, root)

      if (!matches(include, raw)) {
        modules.delete(key)
        return null
      }

      if (matches(exclude, raw)) {
        modules.delete(key)
        return null
      }

      if (!code.includes("@pumped-fn/lite")) {
        modules.delete(key)
        return null
      }

      const meta = readLite(code, key)
      if (!meta) {
        modules.delete(key)
        return null
      }

      modules.set(meta.id, await resolveMeta(meta, raw, root, (source, importer) => resolveImport(this, source, importer)))
      return null
    },

    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName,
        source: JSON.stringify(hmrMeta(modules), null, 2),
      })
    },
  }
}

function hmrMeta(modules: ReadonlyMap<string, ModuleMeta>): LiteMeta {
  const list = [...modules.values()].sort((left, right) => left.id.localeCompare(right.id))
  const handles = handleIndex(list)
  const linked = list.map((mod) => ({
    ...mod,
    edges: mod.edges.map((edge) => linkEdge(edge, handles)),
  }))
  return {
    modules: linked,
    handles: linked.flatMap((mod) => mod.handles),
    atoms: linked.flatMap((mod) => mod.atoms),
    edges: linked.flatMap((mod) => mod.edges),
    issues: linked.flatMap((mod) => mod.issues),
  }
}

function handleIndex(modules: readonly ModuleMeta[]): ReadonlyMap<string, HandleMeta> {
  return new Map(modules.flatMap((mod) => mod.handles.map((handle) => [`${mod.id}:${handle.name}`, handle] as const)))
}

function linkEdge(edge: EdgeMeta, handles: ReadonlyMap<string, HandleMeta>): EdgeMeta {
  if (!edge.importId) return edge
  const handle = handles.get(`${edge.importId}:${edge.toName}`)
  return handle ? { ...edge, to: handle.key, toKind: handle.kind } : edge
}

async function dropAndRefresh(
  modules: Map<string, ModuleMeta>,
  id: string,
  server: ViteDevServer | undefined,
  root: string
): Promise<void> {
  drop(modules, id, server)
  if (server) await refreshImports(modules, server, root)
}

async function refreshImports(modules: Map<string, ModuleMeta>, server: ViteDevServer, root: string): Promise<boolean> {
  let changed = false
  for (const meta of [...modules.values()]) {
    const next = await resolveMeta(meta, sourceId(meta.id, root), root, (source, importer) => resolveServerImport(server, source, importer))
    if (modules.get(meta.id) !== meta) continue
    changed = set(modules, next, server) || changed
  }
  return changed
}

async function resolveMeta(
  meta: ModuleMeta,
  importer: string,
  root: string,
  resolve: ResolveImport
): Promise<ModuleMeta> {
  const edges = await Promise.all(meta.edges.map((edge) => resolveEdge(importer, root, edge, resolve)))
  return {
    ...meta,
    edges,
  }
}

async function resolveEdge(
  importer: string,
  root: string,
  edge: EdgeMeta,
  resolve: ResolveImport
): Promise<EdgeMeta> {
  if (!edge.importSource) return edge
  const id = await resolve(edge.importSource, importer)
  return id ? { ...edge, importId: displayId(id, root) } : edge
}

function resolveImport(ctx: ResolveContext, source: string, importer: string): Promise<string | undefined> {
  return ctx.resolve(source, importer, { skipSelf: true }).then((resolved) => resolved?.id)
}

function resolveHmrImport(
  ctx: ResolveContext,
  server: ViteDevServer | undefined,
  source: string,
  importer: string
): Promise<string | undefined> {
  return server ? resolveServerImport(server, source, importer) : resolveImport(ctx, source, importer)
}

function resolveServerImport(server: ViteDevServer, source: string, importer: string): Promise<string | undefined> {
  return server.pluginContainer.resolveId(source, importer).then((resolved) => resolved?.id)
}

function displayId(id: string, root: string): string {
  const file = clean(id)
  return root && file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file
}

function sourceId(id: string, root: string): string {
  return root && !id.startsWith("/") ? `${root}/${id}` : id
}

function metaModule(server: ViteDevServer) {
  return server.moduleGraph.getModuleById(resolvedHmrMetaModule)
}

function invalidateMeta(server: ViteDevServer | undefined): void {
  if (!server) return
  const mod = metaModule(server)
  if (mod) server.moduleGraph.invalidateModule(mod)
}

function set(modules: Map<string, ModuleMeta>, meta: ModuleMeta, server: ViteDevServer | undefined): boolean {
  const current = modules.get(meta.id)
  modules.set(meta.id, meta)
  if (JSON.stringify(current) === JSON.stringify(meta)) return false
  invalidateMeta(server)
  return true
}

function drop(modules: Map<string, ModuleMeta>, id: string, server: ViteDevServer | undefined): boolean {
  if (!modules.delete(id)) return false
  invalidateMeta(server)
  return true
}

function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0
  const result = pattern.test(value)
  pattern.lastIndex = 0
  return result
}

function clean(id: string): string {
  return id.split("?")[0]!.replace(/\\/g, "/")
}

function send(
  res: ResponseLike,
  type: string,
  body: string
): void {
  res.statusCode = 200
  res.setHeader("content-type", type)
  res.end(body)
}

function inspector(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pumped Lite HMR</title>
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;color:#18181b;background:#fafafa}
main{max-width:1120px;margin:0 auto;padding:24px}
h1{font-size:20px;margin:0 0 16px}
.bar{display:flex;gap:8px;align-items:center;margin-bottom:12px}
input{font:inherit;padding:6px 8px;border:1px solid #d4d4d8;border-radius:4px;min-width:280px}
.counts{color:#52525b;font-size:13px}
table{width:100%;border-collapse:collapse;background:white;border:1px solid #e4e4e7}
th,td{text-align:left;border-bottom:1px solid #e4e4e7;padding:7px 8px;font-size:13px}
th{background:#f4f4f5;font-weight:600}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
h2{font-size:15px;margin:18px 0 8px}
</style>
</head>
<body>
<main>
<h1>Pumped Lite HMR</h1>
<div class="bar"><input id="q" aria-label="Filter handles" placeholder="Filter kind, name, or file"><span class="counts" id="counts"></span></div>
<h2>Handles</h2>
<table><thead><tr><th>Kind</th><th>Name</th><th>File</th><th>Line</th><th>HMR key</th></tr></thead><tbody id="rows"></tbody></table>
<h2>Deps</h2>
<table><thead><tr><th>From</th><th>Slot</th><th>To</th><th>Via</th><th>Source</th></tr></thead><tbody id="deps"></tbody></table>
<h2>Issues</h2>
<table><thead><tr><th>Code</th><th>Handle</th><th>Slot</th><th>Target</th><th>File</th></tr></thead><tbody id="issues"></tbody></table>
</main>
<script type="module">
const q = document.querySelector("#q")
const rows = document.querySelector("#rows")
const deps = document.querySelector("#deps")
const issues = document.querySelector("#issues")
const counts = document.querySelector("#counts")
const meta = await fetch("${hmrMetaPath}").then((res) => res.json())
function cell(value) {
  const td = document.createElement("td")
  const node = value.includes("/") || value.includes(":") ? document.createElement("code") : document.createTextNode(value)
  if (node instanceof HTMLElement) node.textContent = value
  td.append(node)
  return td
}
function render() {
  const needle = q.value.toLowerCase()
  const handles = meta.handles.filter((handle) => [handle.kind, handle.name, handle.file].some((value) => value.toLowerCase().includes(needle)))
  const edges = meta.edges.filter((edge) => [edge.fromName, edge.toName, edge.slot, edge.file, edge.importSource || "", edge.importId || ""].some((value) => value.toLowerCase().includes(needle)))
  const notes = meta.issues.filter((issue) => [issue.code, issue.fromName, issue.slot, issue.target || "", issue.file].some((value) => value.toLowerCase().includes(needle)))
  counts.textContent = meta.handles.length + " handles, " + meta.atoms.length + " HMR atoms, " + meta.edges.length + " deps, " + meta.issues.length + " issues"
  rows.replaceChildren(...handles.map((handle) => {
    const tr = document.createElement("tr")
    for (const value of [handle.kind, handle.name, handle.file, String(handle.line), handle.kind === "atom" ? handle.key : ""]) {
      tr.append(cell(value))
    }
    return tr
  }))
  deps.replaceChildren(...edges.map((edge) => {
    const tr = document.createElement("tr")
    for (const value of [edge.fromName, edge.slot, edge.toName, edge.via, edge.importId || edge.importSource || edge.to]) {
      tr.append(cell(value))
    }
    return tr
  }))
  issues.replaceChildren(...notes.map((issue) => {
    const tr = document.createElement("tr")
    for (const value of [issue.code, issue.fromName, issue.slot, issue.target || "", issue.file + ":" + issue.line]) {
      tr.append(cell(value))
    }
    return tr
  }))
}
q.addEventListener("input", render)
render()
</script>
</body>
</html>`
}
