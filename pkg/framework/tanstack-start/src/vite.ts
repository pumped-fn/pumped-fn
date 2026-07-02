import type { Plugin } from "vite"

type BoundaryPattern = RegExp | string

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

export interface BoundaryOptions {
  readonly include?: BoundaryPattern[]
  readonly exclude?: BoundaryPattern[]
  readonly client?: BoundaryPattern[]
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

  return {
    name: "pumped-fn-tanstack-start-boundary",
    async transform(code, id) {
      const direct = await checker.add(
        clean(id),
        code,
        (source) => this.resolve(source, id, { skipSelf: true }).then((resolved) => resolved?.id),
        (input) => this.parse(input)
      )
      if (direct) throw new Error(format(direct))
      const violation = checker.violation()
      if (violation) throw new Error(format(violation))
      return null
    },
    buildStart() {
      checker.reset()
    },
    watchChange(id) {
      checker.delete(clean(id))
    },
    buildEnd() {
      const violation = checker.violation()
      if (violation) throw new Error(format(violation))
    },
  }
}

export const tanstackStartBoundary = boundary

function createChecker(options: BoundaryOptions) {
  const config = merge(options)
  const records = new Map<string, ModuleRecord>()

  return {
    async add(id: string, code: string, resolve: Resolver, parse: Parser) {
      if (!matches(config.include, id) || matches(config.exclude, id)) {
        records.delete(id)
        return
      }
      const record = await read(id, code, resolve, parse, config)
      records.set(id, record)
      return localViolation(record)
    },
    violation() {
      for (const record of records.values()) {
        if (record.client) {
          const violation = reachesServer(record, records, config, new Set())
          if (violation) return violation
        }
      }
      return undefined
    },
    delete(id: string) {
      records.delete(id)
    },
    reset() {
      records.clear()
    },
  }
}

function merge(options: BoundaryOptions): Required<BoundaryOptions> {
  return {
    include: options.include ?? defaults.include,
    exclude: options.exclude ?? defaults.exclude,
    client: options.client ?? defaults.client,
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
  config: Required<BoundaryOptions>
): Promise<ModuleRecord> {
  const edges: ModuleEdge[] = []
  let directRuntime = false
  let violation: BoundaryViolation | undefined
  const adapter = await resolve(packageName)
  const adapterRoot = adapter ? runtimeRoot(clean(adapter)) : undefined

  for (const reference of references(parse(code))) {
    const resolved = await resolve(reference.source)
    if (runtimeReference(reference.source, resolved, adapterRoot, config)) {
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
    client: matches(config.client, id),
    bridge: matches(config.functions, id),
    server: matches(config.server, id),
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
  seen: Set<string>
): BoundaryViolation | undefined {
  if (record.violation) return record.violation
  if (seen.has(record.id) || record.bridge) return undefined
  seen.add(record.id)

  if (record.directRuntime && !record.server) {
    return {
      id: record.id,
      message: record.client && !record.bridge
        ? directRuntimeMessage()
        : `Client-reachable module ${record.id} reaches TanStack Start backend boundary ${record.id}.`,
    }
  }

  for (const edge of record.edges) {
    const id = edge.resolved ? clean(edge.resolved) : undefined
    if (!id) continue
    if (matches(config.exclude, id)) continue
    const target = records.get(id)
    const server = matches(config.server, id) || Boolean(target?.server)
    const runtime = Boolean(target?.directRuntime && !target.bridge)
    if (server || runtime) {
      return {
        id: record.id,
        message: `Client-reachable module ${record.id} reaches TanStack Start backend boundary ${id} through ${edge.source}.`,
      }
    }
    if (target) {
      const violation = reachesServer(target, records, config, seen)
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
  adapterRoot: string | undefined,
  config: Required<BoundaryOptions>
): boolean {
  if (matches(config.specifiers, source)) return true
  if (source.startsWith(`${packageName}/`)) return true
  const id = resolved ? clean(resolved) : undefined
  if (!id) return false
  if (id.includes(`/node_modules/${packageName}/`)) return true
  return adapterRoot ? id === adapterRoot.slice(0, -1) || id.startsWith(adapterRoot) : false
}

function runtimeRoot(resolved: string): string {
  const marker = `/node_modules/${packageName}/`
  const index = resolved.indexOf(marker)
  if (index >= 0) return resolved.slice(0, index + marker.length)
  return resolved.slice(0, resolved.lastIndexOf("/") + 1)
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
