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

  "mental-model": {
    title: "Mental Model",
    content: `@pumped-fn/lite is a scoped dependency graph with three primitives:

  ATOM = singleton (cached per scope)
    Created once. Lives as long as the scope. Think: db pool, config, auth service.
    Resolved via scope.resolve(atom). Second call returns cached value.
    Factory receives ResolveContext: ctx.cleanup(), ctx.invalidate(), ctx.scope, ctx.data.

  FLOW = transient operation (new instance per exec)
    Runs once per ctx.exec() call. Think: HTTP handler, mutation, query.
    Factory receives ExecutionContext: ctx.exec(), ctx.onClose(), ctx.input, ctx.parent, ctx.data.

  RESOURCE = execution-scoped singleton (shared within an exec chain)
    Created fresh per root ctx.exec(). Shared across nested exec() calls via seek-up.
    Think: per-request logger, transaction, trace span.
    Declared as a flow dep, NOT called directly.

Scope = the container. Owns all atom caches. One per process (server) or per component tree (React).
ExecutionContext = the request boundary. Created per request/operation. Carries tags. Closes with cleanup.
Controller = opt-in reactive handle for an atom. Enables set/update/invalidate/subscribe.
Tag = ambient typed value. Propagates through scope → context → nested exec. No parameter drilling.
Preset = test/environment override. Replaces any atom or flow without touching production code.
Extension = middleware for resolve and exec. Wraps every atom resolution and flow execution.

Key invariant: atoms are resolved from scope, flows are executed from context.
  scope.resolve(atom)         ✓ correct
  ctx.exec({ flow, input })   ✓ correct
  scope.resolve(flow)          ✗ wrong — flows are not cached
  ctx.exec({ atom })           ✗ wrong — atoms are not executed`,
  },

  primitives: {
    title: "Primitives API",
    content: `There are three primitives with distinct lifetimes:
  atom  — SINGLETON per scope. Created once, cached, reused everywhere. Think: db pool, config, service instance.
  flow  — EPHEMERAL per call. New execution each time ctx.exec() is called. Think: HTTP handler, mutation, query.
  resource — EPHEMERAL per execution chain. Created once per ctx.exec() tree, shared across nested execs. Think: logger, transaction, trace span.

atom({ factory, deps?, tags?, keepAlive? })
  Factory receives (resolveCtx, resolvedDeps) → value.
  resolveCtx has: cleanup(fn), invalidate(), scope, data.
  Resolved via scope.resolve(atom). Cached — second resolve() returns same value.

  import { atom } from "@pumped-fn/lite"
  const dbAtom = atom({ factory: () => createDbPool() })
  const userAtom = atom({
    deps: { db: dbAtom },
    factory: (ctx, { db }) => db.query("SELECT ..."),
  })

flow({ factory, parse?, deps?, tags? })
  Factory receives (executionCtx, resolvedDeps) → output.
  executionCtx has: exec(), onClose(fn), input, parent, data, scope, name.
  Executed via ctx.exec({ flow, input }). Never cached — each call runs the factory.

  import { flow, typed } from "@pumped-fn/lite"
  const getUser = flow({
    parse: typed<{ id: string }>(),
    deps: { db: dbAtom },
    factory: (ctx, { db }) => db.findUser(ctx.input.id),
  })

resource({ factory, deps?, name? })
  Like a flow factory but resolved as a DEPENDENCY of flows, not called directly.
  Created fresh per execution chain. Shared via seek-up: nested ctx.exec() reuses parent's instance.
  Factory receives (executionCtx, resolvedDeps) → instance.
  Cleanup via ctx.onClose(fn).

  import { resource } from "@pumped-fn/lite"
  const txResource = resource({
    deps: { db: dbAtom },
    factory: (ctx, { db }) => {
      const tx = db.beginTransaction()
      ctx.onClose(result => result.ok ? tx.commit() : tx.rollback())
      return tx
    },
  })
  // Used as a flow dep — NOT called directly
  const saveUser = flow({
    deps: { tx: txResource },
    factory: (ctx, { tx }) => tx.insert("users", ctx.input),
  })

tag({ label, default?, parse? })
  Ambient context value. Propagates through scope → context → exec hierarchy.
  Resolution order: exec tags > context tags > scope tags (nearest wins).

  import { tag } from "@pumped-fn/lite"
  const tenantTag = tag<string>({ label: "tenant" })

preset(target, value)
  Override an atom or flow's resolved value. Used for testing and multi-tenant isolation.
  value can be: a literal, another atom (redirect), or a function (flow only).

  import { preset } from "@pumped-fn/lite"
  const mockDb = preset(dbAtom, fakeDatabaseInstance)

service({ factory, deps? })
  Convenience wrapper for atom whose value is an object of methods.
  Each method MUST have (ctx: ExecutionContext, ...args) as signature.
  Called via ctx.exec({ fn: svc.method, params: [args] }) for lifecycle/tracing.`,
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
    content: `IMPORTANT: There are two context types. Don't confuse them.

ResolveContext (received by atom factories):
  ctx.cleanup(fn)       register cleanup (runs LIFO on release/invalidate)
  ctx.invalidate()      schedule re-resolution after current factory completes
  ctx.scope             the owning Scope
  ctx.data              per-atom key-value store (persists across invalidations)

ExecutionContext (received by flow factories, resource factories, and inline fns):
  ctx.exec(...)         execute a nested flow or function (creates child context)
  ctx.onClose(fn)       register cleanup (runs LIFO on close, receives CloseResult)
  ctx.close(result?)    close this context, run all cleanups
  ctx.input             parsed input (flows only)
  ctx.parent            parent ExecutionContext (undefined for root)
  ctx.name              exec name or flow name
  ctx.scope             the owning Scope
  ctx.data              per-context key-value store with tag support

ctx = scope.createContext({ tags? })
  Creates a root ExecutionContext. Tags merge: exec tags > context tags > scope tags.

ctx.exec({ flow, input?, rawInput?, tags? })  → Promise<output>
  Execute a flow. Creates a child context with merged tags.
  If flow has parse: rawInput goes through parse first, input skips parse.
  Child context closes automatically after execution.

ctx.exec({ fn, params?, name?, tags? })  → Promise<result>
  Execute an inline function: fn(childCtx, ...params).
  Same child-context lifecycle as flow execution.

ctx.data (both context types)
  Raw:   get(key) / set(key, val) / has(key) / delete(key) / clear() / seek(key)
  Typed: getTag(tag) / setTag(tag, val) / hasTag(tag) / deleteTag(tag) / seekTag(tag) / getOrSetTag(tag, default?)

  seek/seekTag walks up the parent chain to find values set in ancestor contexts.
  This is how tags propagate: middleware sets a tag, nested flows read it via seekTag.`,
  },

  reactivity: {
    title: "Reactivity (opt-in)",
    content: `Atoms are STATIC by default — resolved once, value never changes.
Reactivity is opt-in via controllers. Two ways to get a controller:

1. scope.controller(atom) → Controller
   Retrieve the reactive handle for an atom. Same instance per atom per scope.
   Used externally (app code, React hooks, middleware).

2. controller(atom, opts?) → ControllerDep (dep marker)
   Wrap an atom dep so the factory receives a Controller instead of the resolved value.
   Used inside deps: { cfg: controller(configAtom, { resolve: true }) }
   This is NOT the same as scope.controller() — it's a dep declaration.

Controller API:
  ctrl.state                → 'idle' | 'resolving' | 'resolved' | 'failed'
  ctrl.get()                → current value (throws if not resolved)
  ctrl.resolve()            → Promise<value> (resolve if not yet)
  ctrl.set(value)           → replace value, notify listeners, skip factory
  ctrl.update(fn)           → transform value via function, notify listeners
  ctrl.invalidate()         → re-run factory, notify listeners
  ctrl.release()            → release atom, run cleanups
  ctrl.on(event, listener)  → unsubscribe
    events: 'resolving' | 'resolved' | 'failed' | '*'

Controller as dependency (opts):
  controller(atom)                          → dep receives Controller (idle, must manually resolve)
  controller(atom, { resolve: true })       → dep receives Controller (pre-resolved before factory runs)
  controller(atom, { resolve: true, watch: true })  → ALSO auto-invalidates parent when dep value changes
  controller(atom, { resolve: true, watch: true, eq })  → custom equality gate (default: structural deep equal for plain objects, Object.is otherwise)

  watch:true replaces the manual pattern:
    ctx.cleanup(ctx.scope.on('resolved', dep, () => ctx.invalidate()))
  With the declarative:
    deps: { src: controller(srcAtom, { resolve: true, watch: true }) }
  The watch listener is auto-cleaned on re-resolve, release, and dispose.

select(atom, selector, { eq? })  → SelectHandle
  Derived state slice. Only notifies when selected value changes per eq function.
  handle.get()              → current selected value
  handle.subscribe(fn)      → unsubscribe
  handle.dispose()          → clean up internal subscription

scope.on('resolving' | 'resolved' | 'failed', atom, listener)  → unsubscribe
  Listen to atom state transitions at scope level.`,
  },

  tags: {
    title: "Tag System",
    content: `Tags are typed ambient values that propagate without parameter drilling.

tag<T>({ label, default?, parse? })  → Tag<T>
  Define a tag type. The tag object is both a type definition and a factory:
  const tenantTag = tag<string>({ label: "tenant" })
  const tagged = tenantTag("acme")  // creates Tagged<string>

Resolution hierarchy (nearest wins):
  1. exec tags:    ctx.exec({ flow, tags: [tenantTag("exec")] })
  2. flow tags:    flow({ tags: [tenantTag("flow")] })
  3. context tags: scope.createContext({ tags: [tenantTag("ctx")] })
  4. ctx.data:     parent ctx.data.setTag(tenantTag, "middleware")  ← seekTag walks up
  5. scope tags:   createScope({ tags: [tenantTag("scope")] })
  6. tag default:  tag({ label: "tenant", default: "default" })

In atom deps: tags resolve from scope tags (atoms live at scope level).
In flow deps: tags resolve from exec/context/scope hierarchy + ctx.data seek-up.

Attaching tags:
  atom({ tags: [tenantTag("acme")] })                  metadata on atom definition
  flow({ tags: [roleTag("admin")] })                   applied to child context
  scope.createContext({ tags: [userTag(currentUser)] }) on context creation
  ctx.exec({ flow, tags: [localeTag("en")] })          on specific execution
  ctx.data.setTag(tenantTag, "middleware-set")          programmatic, propagates to children

Reading tags:
  tag.get(source)      → T              first match or throw
  tag.find(source)     → T | undefined  first match or undefined
  tag.collect(source)  → T[]            all matches

Context data:
  ctx.data.setTag(tag, value)   set on current context
  ctx.data.getTag(tag)          read from current context only
  ctx.data.seekTag(tag)         walk up parent chain until found
  ctx.data.hasTag(tag)          check current context only

Tag executor (dependency wiring):
  tags.required(tag)   → T        resolves tag or throws (atom deps: scope, flow deps: hierarchy)
  tags.optional(tag)   → T | undefined   resolves or undefined
  tags.all(tag)        → T[]      collects from all levels of hierarchy

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
  wrapResolve?(next, event: ResolveEvent): Promise<value>
  wrapExec?(next, flow, ctx): Promise<output>
}

createScope({ extensions: [ext1, ext2] })

Lifecycle:
  1. scope creation  → ext.init(scope) called for each extension
  2. await scope.ready  → all init() resolved
  3. resolve(atom)  → ext.wrapResolve(next, { kind: "atom", target, scope })
     resolve(resource) → ext.wrapResolve(next, { kind: "resource", target, ctx })
     - call next() to proceed to actual resolution
     - dispatch on event.kind for atom vs resource
  4. ctx.exec(flow)  → ext.wrapExec(next, flow, ctx)
     - call next() to proceed to actual execution
  5. scope.dispose()  → ext.dispose(scope) called for each extension

Example:
  const timingExt: Extension = {
    wrapResolve: async (next, event) => {
      const start = Date.now()
      const value = await next()
      console.log(event.target, Date.now() - start, "ms")
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

  "tanstack-start": {
    title: "TanStack Start Integration",
    content: `Singleton scope at server entry, per-request ExecutionContext via middleware.

Server entry — one scope per process:
  const scope = createScope({ extensions: [otel()], tags: [envTag(env)] })
  export default createServerEntry({
    async fetch(request) {
      return handler.fetch(request, { context: { scope } })
    },
  })

Execution context middleware — per-request lifecycle:
  export const execCtxMiddleware = createMiddleware()
    .server(async ({ next, context: { scope } }) => {
      const execContext = scope.createContext({})
      try {
        return await next({ context: { execContext } })
      } finally {
        await execContext.close()
      }
    })

Tag-seeding middleware — ambient data for downstream:
  export const authMiddleware = createMiddleware()
    .middleware([execCtxMiddleware])
    .server(async ({ next, context: { execContext } }) => {
      const user = await resolveCurrentUser()
      execContext.data.setTag(currentUserTag, user)
      return next({ context: { user } })
    })

  export const transactionMiddleware = createMiddleware()
    .middleware([authMiddleware])
    .server(async ({ next, context: { execContext } }) => {
      const tx = await beginTransaction()
      execContext.data.setTag(transactionTag, tx)
      try {
        const result = await next()
        await tx.commit()
        return result
      } catch (e) {
        await tx.rollback()
        throw e
      }
    })

Server functions — execute flows via context:
  export const listInvoices = createServerFn({ method: 'POST' })
    .middleware([transactionMiddleware])
    .handler(async ({ data, context: { execContext } }) => {
      return execContext.exec({ flow: invoiceFlows.list, rawInput: data })
    })

Client hydration — preset loader data into client scope:
  const loaderData = Route.useLoaderData()
  const scope = createScope({
    presets: [
      preset(invoicesAtom, loaderData.invoices),
      preset(userAtom, loaderData.user),
    ],
  })
  return <ScopeProvider scope={scope}><Outlet /></ScopeProvider>

Rules:
  One scope per server process    Atoms cache singletons (connections, services)
  One execContext per request      Tag isolation (user, tx, tracing)
  Middleware creates+closes ctx    Guarantees cleanup even on error
  Tags over function params        Flows read ambient tags, no signature coupling
  execContext.exec({ flow })       Flows get lifecycle, tracing, cleanup
  scope.resolve(atom) for deps     Atoms are long-lived, cached in scope
  Preset server data on client     No re-fetch; atoms hydrate from loader

Don't:
  createScope() in a server fn     New scope per request — atoms re-resolve, connections leak
  flow.factory(ctx, deps) direct   Bypasses context lifecycle, tags, extensions, cleanup
  User/tx as flow input            Couples signatures to transport; use tags instead
  scope.resolve(flow)              Flows are ephemeral — exec(), don't resolve()
  ScopeProvider without presets    Client re-fetches everything server already loaded`,
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
