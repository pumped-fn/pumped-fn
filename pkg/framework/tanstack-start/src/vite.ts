import { existsSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import type { Plugin } from "vite"

type BoundaryPattern = RegExp | string

interface AddResult {
  readonly recorded: boolean
  readonly changed: boolean
  readonly violation?: BoundaryViolation
}

interface ModuleEdge {
  readonly source: string
  readonly resolved: string | undefined
}

interface ModuleRecord {
  readonly id: string
  readonly edges: readonly ModuleEdge[]
  readonly client: boolean
  readonly bridge: boolean
  readonly server: boolean
  readonly directRuntime: boolean
  readonly violation?: BoundaryViolation
}

interface BoundaryViolation {
  readonly id: string
  readonly message: string
  readonly line?: number
  readonly column?: number
}

interface Reference {
  readonly kind: "import" | "export"
  readonly source: string
  readonly index: number
}

type Resolver = (source: string) => Promise<string | undefined>
type Parser = (code: string) => unknown

interface RuntimeTarget {
  readonly entry: string
  readonly root: string | undefined
}

export interface BoundaryOptions {
  readonly include?: BoundaryPattern[]
  readonly exclude?: BoundaryPattern[]
  readonly client?: BoundaryPattern[]
  readonly serverRoutes?: BoundaryPattern[]
  readonly server?: BoundaryPattern[]
  readonly functions?: BoundaryPattern[]
  readonly specifiers?: BoundaryPattern[]
}

const packageName = "@pumped-fn/lite-tanstack-start"

const defaults = {
  include: [/\.[cm]?[jt]sx?$/],
  exclude: [/\/node_modules\//, /\/dist\//],
  client: [
    /\/src\/client\.[cm]?[jt]sx?$/,
    /\/src\/routes\//,
    /\.client\.[cm]?[jt]sx?$/,
    /\.browser\.[cm]?[jt]sx?$/,
  ],
  serverRoutes: [
    /\/src\/routes\/api(?:\/|$)/,
  ],
  server: [
    /\/src\/start\.[cm]?[jt]sx?$/,
    /\/src\/server\.[cm]?[jt]sx?$/,
    /\.server\.[cm]?[jt]sx?$/,
  ],
  functions: [/\.functions\.[cm]?[jt]sx?$/],
  specifiers: [packageName],
} satisfies Required<BoundaryOptions>

export function boundary(options: BoundaryOptions = {}): Plugin {
  const checker = createChecker(options)
  let command: "build" | "serve" = "build"

  return {
    name: "pumped-fn-tanstack-start-boundary",
    configResolved(config) {
      command = config.command
    },
    async transform(code, id) {
      const direct = await checker.add(
        clean(id),
        code,
        (source) => this.resolve(source, id, { skipSelf: true }).then((resolved) => resolved?.id),
        (input) => this.parse(input)
      )
      if (direct.violation) throw new Error(format(direct.violation))
      if (!direct.recorded && !direct.changed) return null
      const violation = command === "serve" ? checker.violation() : undefined
      if (violation) throw new Error(format(violation))
      return null
    },
    watchChange(id) {
      checker.delete(clean(id))
    },
    buildEnd(error) {
      if (error) return
      checker.prune(this.getModuleIds())
      const violation = checker.violation()
      if (violation) throw new Error(format(violation))
    },
  }
}

export const tanstackStartBoundary = boundary

function createChecker(options: BoundaryOptions) {
  const config = merge(options)
  const records = new Map<string, ModuleRecord>()
  let dirty = true
  let cached: BoundaryViolation | undefined
  let runtime: RuntimeTarget | undefined

  return {
    async add(id: string, code: string, resolve: Resolver, parse: Parser): Promise<AddResult> {
      if (!matches(config.include, id) || matches(config.exclude, id)) {
        const changed = records.delete(id)
        dirty = dirty || changed
        return { recorded: false, changed }
      }
      if (!runtime) {
        const adapter = await resolve(packageName).then((value) => value, () => undefined)
        if (adapter) {
          runtime = runtimeTarget(clean(adapter))
          dirty = true
        }
      }
      const record = await read(id, code, resolve, parse, config, runtime)
      const changed = JSON.stringify(records.get(id)) !== JSON.stringify(record)
      records.set(id, record)
      dirty = dirty || changed
      return { recorded: true, changed, violation: localViolation(record) }
    },
    violation() {
      if (!dirty) return cached
      cached = undefined
      for (const record of records.values()) {
        if (record.client) {
          const violation = reachesServer(record, records, config, runtime, new Set())
          if (violation) {
            cached = violation
            break
          }
        }
      }
      dirty = false
      return cached
    },
    delete(id: string) {
      dirty = records.delete(id) || dirty
    },
    prune(ids: Iterable<string>) {
      const live = new Set([...ids].map(clean))
      let changed = false
      for (const id of records.keys()) {
        if (!live.has(id)) changed = records.delete(id) || changed
      }
      dirty = dirty || changed
    },
  }
}

function merge(options: BoundaryOptions): Required<BoundaryOptions> {
  return {
    include: options.include ?? defaults.include,
    exclude: options.exclude ?? defaults.exclude,
    client: options.client ?? defaults.client,
    serverRoutes: options.serverRoutes ?? defaults.serverRoutes,
    server: options.server ?? defaults.server,
    functions: options.functions ?? defaults.functions,
    specifiers: options.specifiers ?? defaults.specifiers,
  }
}

async function read(
  id: string,
  code: string,
  resolve: Resolver,
  parse: Parser,
  config: Required<BoundaryOptions>,
  runtime: RuntimeTarget | undefined
): Promise<ModuleRecord> {
  const edges: ModuleEdge[] = []
  let directRuntime = false
  let violation: BoundaryViolation | undefined
  const serverRoute = matches(config.serverRoutes, id)
  const server = serverRoute || matches(config.server, id)

  for (const reference of references(parse(code))) {
    const resolved = await resolve(reference.source)
    if (runtimeReference(reference.source, resolved, runtime, config)) {
      directRuntime = true
      if (reference.kind === "export") {
        violation = location(
          id,
          code,
          reference.index,
          `Runtime re-export of ${reference.source} can leak the TanStack Start backend adapter through barrels.`
        )
      }
    } else {
      edges.push({ source: reference.source, resolved })
    }
  }

  return {
    id,
    edges,
    directRuntime,
    client: matches(config.client, id) && !serverRoute,
    bridge: matches(config.functions, id),
    server,
    violation,
  }
}

function localViolation(record: ModuleRecord): BoundaryViolation | undefined {
  if (record.violation && record.client && !record.server) return record.violation
  if (record.directRuntime && record.client && !record.server && !record.bridge) {
    return {
      id: record.id,
      message: directRuntimeMessage(),
    }
  }
  return undefined
}

function reachesServer(
  record: ModuleRecord,
  records: ReadonlyMap<string, ModuleRecord>,
  config: Required<BoundaryOptions>,
  runtime: RuntimeTarget | undefined,
  seen: Set<string>
): BoundaryViolation | undefined {
  if (record.violation) return record.violation
  if (seen.has(record.id) || record.bridge) return undefined
  seen.add(record.id)

  if (record.directRuntime && !record.server) {
    return {
      id: record.id,
      message: record.client ? directRuntimeMessage() : `Client-reachable module ${record.id} reaches TanStack Start backend boundary.`,
    }
  }

  for (const edge of record.edges) {
    const id = edge.resolved ? clean(edge.resolved) : undefined
    if (!id) continue
    if (runtimeReference(edge.source, id, runtime, config)) {
      return {
        id: record.id,
        message: `Client-reachable module ${record.id} reaches TanStack Start backend boundary ${id} through ${edge.source}.`,
      }
    }
    if (matches(config.exclude, id)) continue
    const target = records.get(id)
    const server = matches(config.server, id) || Boolean(target?.server)
    const targetRuntime = Boolean(target?.directRuntime && !target.bridge)
    if (server || targetRuntime) {
      return {
        id: record.id,
        message: `Client-reachable module ${record.id} reaches TanStack Start backend boundary ${id} through ${edge.source}.`,
      }
    }
    if (target) {
      const violation = reachesServer(target, records, config, runtime, seen)
      if (violation) return violation
    }
  }

  return undefined
}

function directRuntimeMessage(): string {
  return `Runtime import of ${packageName} is only allowed in TanStack Start server or server-function boundary files.`
}

function runtimeReference(
  source: string,
  resolved: string | undefined,
  runtime: RuntimeTarget | undefined,
  config: Required<BoundaryOptions>
): boolean {
  if (matches(config.specifiers, source)) return true
  if (source.startsWith(`${packageName}/`)) return true
  const id = resolved ? clean(resolved) : undefined
  if (!id) return false
  if (id.includes(`/node_modules/${packageName}/`)) return true
  if (runtime?.root && (id === runtime.root.slice(0, -1) || id.startsWith(runtime.root))) return true
  return runtime ? id === runtime.entry : false
}

function runtimeTarget(resolved: string): RuntimeTarget {
  const marker = `/node_modules/${packageName}/`
  const index = resolved.indexOf(marker)
  return {
    entry: resolved,
    root: index >= 0 ? resolved.slice(0, index + marker.length) : packageRoot(resolved, packageName),
  }
}

function packageRoot(file: string, name: string): string | undefined {
  let dir = dirname(file)
  for (;;) {
    const manifest = `${dir}/package.json`
    if (existsSync(manifest) && packageNameOf(manifest) === name) return `${dir}/`
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function packageNameOf(file: string): string | undefined {
  const value = JSON.parse(readFileSync(file, "utf8")) as { name?: unknown }
  return typeof value.name === "string" ? value.name : undefined
}

function references(root: unknown): Reference[] {
  const found: Reference[] = []
  walk(root, (node) => {
    const type = string(node["type"])
    if (type === "ImportDeclaration") push(found, "import", source(node["source"]), node["start"])
    if (type === "ExportNamedDeclaration" || type === "ExportAllDeclaration") {
      push(found, "export", source(node["source"]), node["start"])
    }
    if (type === "ImportExpression") push(found, "import", source(node["source"]), node["start"])
    if (type === "CallExpression" && string(record(node["callee"])?.["type"]) === "Import") {
      push(found, "import", source(first(node["arguments"])), node["start"])
    }
  })
  return found
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  const node = record(value)
  if (!node) return
  visit(node)
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit)
    } else {
      walk(child, visit)
    }
  }
}

function push(found: Reference[], kind: Reference["kind"], source: string | undefined, start: unknown): void {
  if (source) found.push({ kind, source, index: typeof start === "number" ? start : 0 })
}

function source(value: unknown): string | undefined {
  return string(record(value)?.["value"])
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined
}

function location(id: string, code: string, index: number, message: string): BoundaryViolation {
  const before = code.slice(0, index).split("\n")
  return {
    id,
    message,
    line: before.length,
    column: before[before.length - 1]!.length,
  }
}

function matches(patterns: readonly BoundaryPattern[], value: string): boolean {
  return patterns.some((pattern) => typeof pattern === "string" ? pattern === value : pattern.test(value))
}

function clean(id: string): string {
  return id.split("?")[0]!.replace(/\\/g, "/")
}

function format(violation: BoundaryViolation): string {
  const place = violation.line === undefined ? violation.id : `${violation.id}:${violation.line}:${(violation.column ?? 0) + 1}`
  return `${violation.message}\n${place}`
}
