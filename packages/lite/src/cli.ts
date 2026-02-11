#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const readme = readFileSync(join(pkgDir, "README.md"), "utf-8")

function extractOverview(): string {
  const idx = readme.indexOf("## How It Works")
  const raw = idx === -1 ? readme : readme.slice(0, idx)
  return raw.replace(/^#[^\n]*\n+/, "").trim()
}

function extractDiagram(): string {
  const match = readme.match(/```mermaid\n([\s\S]*?)```/)
  return match ? `Full system sequence (unified):\n\n\`\`\`mermaid\n${match[1]!.trim()}\n\`\`\`` : "No diagram found in README.md"
}

const categories: Record<string, { title: string; content: string | (() => string) }> = {
  overview: {
    title: "What is @pumped-fn/lite",
    content: extractOverview,
  },

  primitives: {
    title: "Primitives API",
    content: `atom({ factory, deps?, tags?, keepAlive? })
  Creates a managed effect. Factory receives (ctx, resolvedDeps) and returns a value.
  Cached per scope. Supports cleanup via ctx.onClose().

  import { atom } from "@pumped-fn/lite"
  const dbAtom = atom({ factory: () => createDbPool() })
  const userAtom = atom({
    deps: { db: dbAtom },
    factory: (ctx, { db }) => db.query("SELECT ..."),
  })

flow({ factory, parse?, deps?, tags? })
  Operation template executed per call. parse validates input, factory runs logic.

  import { flow, typed } from "@pumped-fn/lite"
  const getUser = flow({
    parse: typed<{ id: string }>(),
    deps: { db: dbAtom },
    factory: (ctx, { db }) => db.findUser(ctx.input.id),
  })

tag({ label, default?, parse? })
  Ambient context value. Attach to atoms/flows/contexts. Retrieve via tag.get/find/collect.

  import { tag } from "@pumped-fn/lite"
  const tenantTag = tag<string>({ label: "tenant" })

preset(target, value)
  Override an atom's resolved value. Used for testing and multi-tenant isolation.

  import { preset } from "@pumped-fn/lite"
  const mockDb = preset(dbAtom, fakeDatabaseInstance)

service({ factory, deps? })
  Convenience wrapper for atom whose value is an object of methods.
  Each method receives (ctx, ...args) for tracing/auth integration.`,
  },

  scope: {
    title: "Scope Management",
    content: `createScope({ extensions?, presets?, tags?, gc? })
  Creates a scope that manages atom resolution, caching, extensions, and GC.

  import { createScope } from "@pumped-fn/lite"
  const scope = createScope({
    extensions: [loggingExt],
    presets: [preset(dbAtom, mockDb)],
    tags: [tenantTag("acme")],
    gc: { enabled: true, graceMs: 3000 },
  })
  await scope.ready

scope.resolve(atom)        → Promise<value>     resolve and cache an atom
scope.controller(atom)     → Controller          get reactive handle
scope.select(atom, fn, opts?) → SelectHandle     derived slice with equality check
scope.on(event, atom, fn)  → unsubscribe         listen to atom events
scope.release(atom)        → void                release atom, run cleanups
scope.createContext(opts?)  → ExecutionContext    create execution boundary
scope.flush()              → Promise<void>       wait all pending operations
scope.dispose()            → void                release everything, run all cleanups`,
  },

  context: {
    title: "ExecutionContext",
    content: `ctx = scope.createContext({ tags? })
  Execution boundary. Tags merge with scope tags. Cleanup runs LIFO on close.

ctx.exec({ flow, input?, tags? })  → Promise<output>
  Execute a flow within this context. Creates a child context with merged tags.
  Child context closes automatically after execution.

ctx.exec({ fn, params?, tags? })   → Promise<result>
  Execute an inline function: fn(childCtx, ...params).
  Same child-context lifecycle as flow execution.

ctx.onClose(cleanup)   → void     register cleanup (runs LIFO on ctx.close)
ctx.close()            → void     run all registered cleanups in LIFO order

ctx.data
  Key-value store scoped to the context:
    Raw:   get(key) / set(key, val) / has(key) / delete(key) / clear() / seek(key)
    Typed: getTag(tag) / setTag(tag, val) / hasTag(tag) / deleteTag(tag) / seekTag(tag) / getOrSetTag(tag, factory)

  seek/seekTag walks up the context chain to find values in parent contexts.`,
  },

  reactivity: {
    title: "Reactivity (opt-in)",
    content: `controller(atom)  → Controller
  Opt-in reactive handle for an atom.

  ctrl.get()                  → current value (must be resolved first)
  ctrl.resolve()              → Promise<value> (resolve if not yet)
  ctrl.set(value)             → replace value, notify listeners
  ctrl.update(fn)             → update value via function, notify listeners
  ctrl.invalidate()           → re-run factory, notify listeners
  ctrl.release()              → release atom, run cleanups
  ctrl.on(event, listener)    → unsubscribe
    events: 'resolving' | 'resolved' | '*'

select(atom, selector, { eq? })  → SelectHandle
  Derived state slice. Only notifies when selected value changes per eq function.

  handle.get()              → current selected value
  handle.subscribe(fn)      → unsubscribe

scope.on('resolved', atom, listener)  → unsubscribe
  Listen to atom resolution events at scope level.

Controller as dependency:
  import { controller } from "@pumped-fn/lite"
  const serverAtom = atom({
    deps: { cfg: controller(configAtom, { resolve: true }) },
    factory: (ctx, { cfg }) => {
      cfg.on('resolved', () => ctx.invalidate())
      return createServer(cfg.get())
    },
  })`,
  },

  tags: {
    title: "Tag System",
    content: `tag<T>({ label, default?, parse? })  → Tag<T>
  Define an ambient context value type.

tag(value)  → Tagged<T>
  Create a tagged value to attach to atoms, flows, or contexts.

Attaching tags:
  atom({ tags: [tenantTag("acme")] })
  flow({ tags: [roleTag("admin")] })
  scope.createContext({ tags: [userTag(currentUser)] })
  ctx.exec({ flow, tags: [localeTag("en")] })

Reading tags:
  tag.get(source)      → T           first match or throw
  tag.find(source)     → T | undefined   first match or undefined
  tag.collect(source)  → T[]         all matches

Context data integration:
  ctx.data.setTag(tag, value)
  ctx.data.getTag(tag)        → T
  ctx.data.seekTag(tag)       → T (walks parent chain)
  ctx.data.hasTag(tag)        → boolean

Tag executor (dependency wiring):
  tags.required(tag)   → resolves tag or throws
  tags.optional(tag)   → resolves tag or undefined
  tags.all(tag)        → resolves all values for tag

Introspection:
  tag.atoms()          → Atom[] with this tag attached
  getAllTags()          → Tag[] all registered tags`,
  },

  extensions: {
    title: "Extensions Pipeline",
    content: `Extensions wrap atom resolution and flow execution (middleware pattern).

interface Extension {
  init?(scope): void | Promise<void>
  dispose?(scope): void
  wrapResolve?(next, atom, scope): Promise<value>
  wrapExec?(next, flow, ctx): Promise<output>
}

createScope({ extensions: [ext1, ext2] })

Lifecycle:
  1. scope creation  → ext.init(scope) called for each extension
  2. await scope.ready  → all init() resolved
  3. resolve(atom)  → ext.wrapResolve(next, atom, scope)
     - call next() to proceed to actual resolution
     - add before/after logic around next()
  4. ctx.exec(flow)  → ext.wrapExec(next, flow, ctx)
     - call next() to proceed to actual execution
  5. scope.dispose()  → ext.dispose(scope) called for each extension

Example:
  const timingExt: Extension = {
    wrapResolve: async (next, atom, scope) => {
      const start = Date.now()
      const value = await next()
      console.log(atom, Date.now() - start, "ms")
      return value
    },
  }`,
  },

  testing: {
    title: "Testing & Isolation",
    content: `Use presets to swap implementations without changing production code.

import { createScope, preset } from "@pumped-fn/lite"

const scope = createScope({
  presets: [
    preset(dbAtom, mockDatabase),
    preset(cacheAtom, inMemoryCache),
  ],
  tags: [tenantTag("test-tenant")],
})

const db = await scope.resolve(dbAtom)  // → mockDatabase (not real db)

Multi-tenant isolation:
  Each scope is fully isolated. Create one scope per tenant/test.

  const tenantScope = createScope({
    tags: [tenantTag(tenantId)],
    presets: tenantOverrides,
  })

Cleanup:
  scope.dispose() releases all atoms and runs all cleanup functions.
  In tests: call scope.dispose() in afterEach.`,
  },

  patterns: {
    title: "Common Patterns",
    content: `Request lifecycle:
  const scope = createScope()
  const ctx = scope.createContext({ tags: [requestTag(req)] })
  const result = await ctx.exec({ flow: handleRequest, input: req.body })
  ctx.close()  // cleanup LIFO

Service pattern:
  const userService = service({
    deps: { db: dbAtom },
    factory: (ctx, { db }) => ({
      getUser: (ctx, id) => db.findUser(id),
      updateUser: (ctx, id, data) => db.updateUser(id, data),
    }),
  })

Typed flow input:
  const getUser = flow({
    parse: typed<{ id: string }>(),
    factory: (ctx) => findUser(ctx.input.id),
  })

Inline execution:
  const result = await ctx.exec({
    fn: (ctx, a, b) => a + b,
    params: [1, 2],
  })

Atom with cleanup:
  const serverAtom = atom({
    factory: (ctx) => {
      const server = createServer()
      ctx.onClose(() => server.close())
      return server
    },
  })

Atom retention / GC:
  createScope({ gc: { enabled: true, graceMs: 3000 } })
  atom({ keepAlive: true })  // never GC'd`,
  },

  diagrams: {
    title: "Visual Diagrams (mermaid)",
    content: extractDiagram,
  },

  types: {
    title: "Type Utilities & Guards",
    content: `Type extractors (Lite.Utils namespace):
  AtomValue<A>          extract resolved type from atom
  FlowOutput<F>         extract output type from flow
  FlowInput<F>          extract input type from flow
  TagValue<T>           extract value type from tag
  DepsOf<A | F>         extract deps record type
  ControllerValue<C>    extract value from controller
  Simplify<T>           flatten intersection types
  AtomType<T, D>        construct atom type
  FlowType<O, I, D>     construct flow type

Type guards:
  isAtom(v)             → v is Atom
  isFlow(v)             → v is Flow
  isTag(v)              → v is Tag
  isTagged(v)           → v is Tagged
  isPreset(v)           → v is Preset
  isControllerDep(v)    → v is ControllerDep
  isTagExecutor(v)      → v is TagExecutor

Convenience types:
  AnyAtom               any atom regardless of value/deps
  AnyFlow               any flow regardless of output/input/deps
  AnyController         any controller regardless of value

Symbols (advanced, for library authors):
  atomSymbol, flowSymbol, tagSymbol, taggedSymbol,
  presetSymbol, controllerSymbol, controllerDepSymbol,
  tagExecutorSymbol, typedSymbol`,
  },
}

const args = process.argv.slice(2)
const category = args[0]

if (!category || category === "help" || category === "--help") {
  console.log("@pumped-fn/lite — Scoped Ambient State for TypeScript\n")
  console.log("Usage: pumped-lite <category>\n")
  console.log("Categories:")
  for (const [key, { title }] of Object.entries(categories)) {
    console.log(`  ${key.padEnd(14)} ${title}`)
  }
  console.log("\nExamples:")
  console.log("  npx @pumped-fn/lite primitives   # API reference")
  console.log("  npx @pumped-fn/lite diagrams     # mermaid diagrams")
  process.exit(0)
}

if (!(category in categories)) {
  console.error(`Unknown category: "${category}"\n`)
  console.error("Available categories: " + Object.keys(categories).join(", "))
  process.exit(1)
}

const entry = categories[category]!
const output = typeof entry.content === "function" ? entry.content() : entry.content
console.log(`# ${entry.title}\n`)
console.log(output)
