import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { scanPaths, scanText, type Diagnostic, type ScanOptions } from "../src/index"

function ids(source: string, filePath = "src/example.ts", options?: ScanOptions) {
  return scanText(source, filePath, options).map((diagnostic) => diagnostic.ruleId)
}

function diagnostics(source: string, filePath = "src/example.ts", options?: ScanOptions): Diagnostic[] {
  return scanText(source, filePath, options)
}

describe("lite lint scanner", () => {
  it("accepts graph code that enters through definitions and public exec APIs", () => {
    expect(ids(`
      import { atom, flow, resource, typed } from "@pumped-fn/lite"

      const store = atom({ name: "store", factory: () => new Map<string, string>() })
      const tx = resource({
        name: "tx",
        ownership: "current",
        factory: (ctx) => {
          ctx.cleanup(() => {})
          return { save: (key: string, value: string) => store.name + key + value }
        },
      })
      export const save = flow({
        name: "save",
        parse: typed<{ key: string; value: string }>(),
        deps: { tx },
        factory: (ctx, { tx }) => tx.save(ctx.input.key, ctx.input.value),
      })
    `)).toEqual([])
  })

  it("finds explicit atom type arguments through direct, aliased, and namespace imports", () => {
    expect(ids(`
      import { atom, atom as defineAtom, flow } from "@pumped-fn/lite"
      import * as Lite from "@pumped-fn/lite"

      const direct = atom<string>({ factory: () => "direct" })
      const aliased = defineAtom<number>({ factory: () => 1 })
      const namespaced = Lite.atom<boolean>({ factory: () => true })
      const typedUnit = flow<string>({ factory: () => "ok" })
    `)).toEqual([
      "pumped/no-explicit-atom-type-argument",
      "pumped/no-explicit-atom-type-argument",
      "pumped/no-explicit-atom-type-argument",
    ])
  })

  it("allows inferred atoms and generic calls that shadow atom imports", () => {
    expect(ids(`
      import { atom, atom as defineAtom } from "@pumped-fn/lite"
      import * as Lite from "@pumped-fn/lite"

      const inferred = atom({ factory: () => "ok" })

      function localDirect(atom: <T>(value: T) => T) {
        return atom<string>("ok")
      }

      function localAlias(defineAtom: <T>(value: T) => T) {
        return defineAtom<string>("ok")
      }

      function localNamespace(Lite: { atom<T>(value: T): T }) {
        return Lite.atom<string>("ok")
      }
    `)).toEqual([])
  })

  it("finds single bindings returned by the immediately following statement", () => {
    expect(ids(`
      function parse(value: string) {
        const result = JSON.parse(value)
        return result
      }

      function normalize(value: string) {
        let normalized = value.trim()
        return normalized
      }
    `)).toEqual([
      "pumped/no-immediate-return-binding",
      "pumped/no-immediate-return-binding",
    ])
  })

  it("finds every immediate-return binding in the same block", () => {
    expect(ids(`
      function unreachableSecondBranch() {
        const first = 1
        return first
        const second = 2
        return second
      }
    `)).toEqual([
      "pumped/no-immediate-return-binding",
      "pumped/no-immediate-return-binding",
    ])
  })

  it("allows bindings that are used, grouped, destructured, or self-referenced before return", () => {
    expect(ids(`
      function parse(value: string) {
        const result = JSON.parse(value)
        validate(result)
        return result
      }

      function pair() {
        const left = 1, right = 2
        return left
      }

      function destructure(value: { result: string }) {
        const { result } = value
        return result
      }

      function recursive() {
        const result = () => result
        return result
      }
    `)).toEqual([])
  })

  it("returns identical diagnostics for repeated bounded-rule scans", () => {
    const source = `
      import { atom as defineAtom } from "@pumped-fn/lite"

      const engine = defineAtom<string>({ factory: () => "ok" })

      function read() {
        const value = engine.name
        return value
      }
    `

    expect(scanText(source, "src/repeat.ts")).toEqual(scanText(source, "src/repeat.ts"))
  })

  it("finds backend and test anti-patterns", () => {
    expect(ids(`
      import { atom, flow } from "@pumped-fn/lite"
      import { vi } from "vitest"

      vi.mock("./transport")
      const profileAtom = atom({ name: "profile", factory: () => fetch("/api/profile") })
      export function runProfile(scope: Lite.Scope) {
        if (${["process", ".env.NODE_ENV"].join("")} === ${'"test"'}) return "fake"
        return scope.createContext()
      }
      export const saveFlow = flow({ name: "save", factory: () => "ok" })
    `)).toEqual([
      "pumped/no-test-only-branches",
      "pumped/no-module-mocks",
      "pumped/no-definition-handle-suffix",
      "pumped/no-ambient-io-outside-boundary",
      "pumped/no-naked-globals",
      "pumped/no-scope-argument",
      "pumped/no-definition-handle-suffix",
    ])
  })

  it("finds shared scope factories in tests", () => {
    expect(ids(`
      import { createScope } from "@pumped-fn/lite"

      function makeScope() {
        return createScope({ tags: [] })
      }

      const buildScope = () => createScope()
    `, "tests/example.test.ts")).toEqual([
      "pumped/no-shared-scope-factory",
      "pumped/no-shared-scope-factory",
    ])
  })

  it("finds direct flow composition inside flow factories", () => {
    expect(ids(`
      import { controller, flow, typed } from "@pumped-fn/lite"

      const load = flow({
        name: "load",
        parse: typed<{ id: string }>(),
        factory: (ctx) => ctx.input.id,
      })

      const hidden = flow({
        name: "hidden",
        factory: (ctx) => ctx.exec({ flow: load, input: { id: "hidden" } }),
      })

      const raw = flow({
        name: "raw",
        deps: { load },
        factory: (_ctx, deps) => deps.load.exec({ input: { id: "raw" } }),
      })

      const explicit = flow({
        name: "explicit",
        deps: { load: controller(load) },
        factory: (_ctx, deps) => deps.load.exec({ input: { id: "explicit" } }),
      })
    `)).toEqual([
      "pumped/no-direct-flow-composition",
      "pumped/prefer-destructured-deps",
      "pumped/no-direct-flow-composition",
      "pumped/prefer-destructured-deps",
    ])
  })

  it("finds factory ctx used as an argument or embedded value", () => {
    expect(ids(`
      import { atom, flow, resource } from "@pumped-fn/lite"

      declare function send(value: unknown): unknown

      const store = atom({
        factory: (ctx) => send(ctx),
      })

      const run = flow({
        factory: (context) => {
          send({ context })
          send([context])
          return "ok"
        },
      })

      const tx = resource({
        factory: (_ctx) => {
          send({ ..._ctx })
          send([..._ctx])
          return { id: "tx" }
        },
      })
    `)).toEqual([
      "pumped/no-ctx-argument",
      "pumped/no-ctx-argument",
      "pumped/no-ctx-argument",
      "pumped/no-ctx-argument",
      "pumped/no-ctx-argument",
    ])
  })

  it("allows factory ctx receiver usage and property reads", () => {
    expect(ids(`
      import { atom, flow } from "@pumped-fn/lite"

      const queue = atom({ factory: () => [] as string[] })

      const run = flow({
        factory: (ctx) => {
          void ctx.input
          void ctx.name
          void ctx.changes(queue)
          return { input: ctx.input }
        },
      })
    `)).toEqual([])
  })

  it("finds graph nodes reaching scope or creating execution contexts", () => {
    const scopeReach = (source: string, filePath = "src/example.ts") =>
      diagnostics(source, filePath).filter((diagnostic) => diagnostic.ruleId === "pumped/no-scope-reach")

    const ctxScopeCreateContext = scopeReach(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        factory: (ctx) => ctx.scope.createContext(),
      })
    `)

    expect(ctxScopeCreateContext).toHaveLength(2)
    expect(ctxScopeCreateContext.map((diagnostic) => diagnostic.message)).toEqual([
      "graph nodes never reach the scope or create execution contexts; boundaries live at composition roots.",
      "graph nodes never reach the scope or create execution contexts; boundaries live at composition roots.",
    ])

    expect(scopeReach(`
      import { flow } from "@pumped-fn/lite"

      declare const someScope: { createContext(): unknown }

      const run = flow({
        factory: () => someScope.createContext(),
      })
    `)).toHaveLength(1)

    expect(scopeReach(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        factory: (ctx) => ctx.scope.resolve(other),
      })
    `)).toHaveLength(1)

    expect(ids(`
      import type { Lite } from "@pumped-fn/lite"

      const execute = (scope: Lite.Scope) => scope.createContext()
    `, "src/main.ts")).toEqual([])

    expect(ids(`
      import type { Lite } from "@pumped-fn/lite"

      const execute = (scope: Lite.Scope) => scope.createContext()
    `, "bin/server.ts")).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        factory: (ctx) => ctx.scope.createContext(),
      })
    `, "tests/example.test.ts")).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({ factory: () => 0 })
      const runner = atom({
        factory: (ctx) => {
          void ctx.exec({})
          void ctx.changes(store)
          return ctx.name
        },
      })
    `)).toEqual([])
  })

  it("finds aliased module mocks and rendered node observer tests", () => {
    expect(ids(`
      import { render } from "@testing-library/react"
      import { vi as vitestVi } from "vitest"

      const v = vitestVi
      const { mock, spyOn } = v
      const mockAuth = v.mock

      v.mock("./a")
      mock("./b")
      mockAuth("./c")
      spyOn(Date, "now")
      render(<div />)
    `, "tests/view.test.tsx")).toEqual([
      "pumped/no-module-mocks",
      "pumped/no-module-mocks",
      "pumped/no-module-mocks",
      "pumped/no-module-mocks",
      "pumped/no-render-outside-browser-test",
    ])
  })

  it("allows rendered observer tests in browser-mode files", () => {
    expect(ids(`
      import { render } from "@testing-library/react"

      render(<div />)
    `, "tests/view.browser.test.tsx")).toEqual([])
  })

  it("finds React observer anti-patterns", () => {
    expect(ids(`
      import { useState } from "react"
      import { useExecutionContext, useScope } from "@pumped-fn/lite-react"

      export function LoginForm() {
        const scope = useScope()
        const run = useExecutionContext()
        const [email, setEmail] = useState("")
        const ctx = scope.createContext()
        void run.exec
        void ctx.close()
        return <button onClick={() => setEmail(email)}>Save</button>
      }
    `, "src/LoginForm.tsx")).toEqual([
      "pumped/no-react-use-scope",
      "pumped/no-react-use-execution-context",
      "pumped/no-react-local-state",
      "pumped/no-react-manual-execution-context",
      "pumped/no-react-manual-execution-context",
    ])
  })

  it("finds namespaced feature use of execution context", () => {
    expect(ids(`
      import * as LiteReact from "@pumped-fn/lite-react"

      export function SaveButton() {
        const ctx = LiteReact.useExecutionContext()
        return <button onClick={() => void ctx.exec}>Save</button>
      }
    `, "src/SaveButton.tsx")).toEqual([
      "pumped/no-react-use-execution-context",
    ])
  })

  it("allows execution context access in tests and composition roots", () => {
    expect(ids(`
      import { useExecutionContext } from "@pumped-fn/lite-react"

      export function Probe() {
        useExecutionContext()
        return null
      }
    `, "tests/Probe.test.tsx")).toEqual([])
    expect(ids(`
      import { useExecutionContext } from "@pumped-fn/lite-react"

      export function MainProbe() {
        useExecutionContext()
        return null
      }
    `, "src/main.tsx")).toEqual([])
  })

  it("allows composition roots and transport declarations to own integration points", () => {
    expect(ids(`
      import { createScope, atom } from "@pumped-fn/lite"
      import { createRoot } from "react-dom/client"

      const bffHttp = atom({ name: "bff-http", factory: () => fetch("/api") })

      export function mountMain(container: Element) {
        const scope = createScope()
        const root = createRoot(container)
        document.body.dataset.ready = "true"
        return {
          scope,
          unmount: async () => {
            root.unmount()
            await scope.dispose()
          },
        }
      }
    `, "src/main.tsx")).toEqual([])
  })

  it("flags exported scope or context glue in composition roots while allowing local root glue", () => {
    const flagged = diagnostics(`
      import type { Lite } from "@pumped-fn/lite"

      export function startWorkers(scope: Lite.Scope) {
        return scope.createContext()
      }
    `, "src/main.ts")

    expect(flagged.map((diagnostic) => diagnostic.ruleId)).toEqual(["pumped/no-scope-argument"])
    expect(flagged[0]?.message).toBe("exported scope/ctx-taking functions are shared glue; roots stay inline, reuse lives in the graph.")

    expect(ids(`
      import type { Lite } from "@pumped-fn/lite"

      const startWorkers = (scope: Lite.Scope) => scope.createContext()
    `, "bin/server.ts")).toEqual([])

    expect(ids(`
      import type { Lite } from "@pumped-fn/lite"

      export const runRequest = (ctx: Lite.ExecutionContext) => ctx.name
    `, "src/server.ts")).toEqual(["pumped/no-scope-argument"])
  })

  it("finds stale public vocabulary and JSDOM backend markers in text files", () => {
    expect(ids(`
      # ${["Gol", "den"].join("")} example

      Use @vitest-environment ${["js", "dom"].join("")} with setup.${"dom"}.ts and User.${"dom"}.test.tsx.
    `, "README.md")).toEqual([
      "pumped/no-internal-example-label",
      "pumped/no-jsdom-backend",
      "pumped/no-jsdom-backend",
      "pumped/no-jsdom-backend",
    ])
  })

  it("finds JSDOM config and package dependencies", () => {
    expect(ids(`
      export default {
        test: {
          environment: "jsdom",
        },
      }
    `, "vitest.config.ts")).toEqual(["pumped/no-jsdom-backend"])
    expect(ids(`
      { "devDependencies": { "jsdom": "catalog:" } }
    `, "package.json")).toEqual(["pumped/no-jsdom-backend"])
  })

  it("walks paths while skipping before examples and generated directories", async () => {
    const root = mkdtempSync(join(tmpdir(), "lite-lint-"))
    try {
      writeFileSync(join(root, "bad.ts"), `
        import { atom } from "@pumped-fn/lite"
        const badAtom = atom({ name: "bad", factory: () => "bad" })
      `)
      writeFileSync(join(root, "before.tsx"), `
        import { useState } from "react"
        export function Before() {
          const [value] = useState("")
          return value
        }
      `)

      const result = await scanPaths([root])

      expect(result.diagnostics.map((diagnostic) => diagnostic.filePath)).toEqual([join(root, "bad.ts")])
      expect(result.diagnostics.map((diagnostic) => diagnostic.ruleId)).toEqual([
        "pumped/no-definition-handle-suffix",
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("finds implicit tag reads and undeclared scope.resolve inside factories", () => {
    expect(ids(`
      import { atom, tags } from "@pumped-fn/lite"

      const requestId = atom({
        name: "requestId",
        factory: (ctx) => ctx.data.seekTag(requestIdTag),
      })
    `)).toEqual(["pumped/no-implicit-tag-read"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const withOther = atom({
        name: "withOther",
        factory: (ctx) => ctx.scope.resolve(other),
      })
    `)).toEqual(["pumped/no-implicit-tag-read", "pumped/no-scope-reach"])
  })

  it("flags implicit tag reads regardless of destructured deps in the factory signature", () => {
    expect(ids(`
      import { atom, tags } from "@pumped-fn/lite"

      const requestId = atom({
        name: "requestId",
        deps: { id: tags.required(requestIdTag) },
        factory: (ctx, { id }) => id ?? ctx.data.seekTag(traceIdTag),
      })
    `)).toEqual(["pumped/no-implicit-tag-read"])
  })

  it("allows tag reads declared in deps or allowlisted", () => {
    expect(ids(`
      import { atom, tags } from "@pumped-fn/lite"

      const requestId = atom({
        name: "requestId",
        deps: { id: tags.required(requestIdTag) },
        factory: (ctx) => ctx.data.seekTag(requestIdTag),
      })
    `)).toEqual([])

    expect(ids(`
      import { atom, tags } from "@pumped-fn/lite"

      const requestId = atom({
        name: "requestId",
        deps: { id: tags.required(requestIdTag) },
        factory: (ctx, { id }) => id ?? ctx.data.seekTag(requestIdTag),
      })
    `)).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const traced = atom({
        name: "traced",
        factory: (ctx) => ctx.data.getTag(traceTag),
      })
    `, "src/example.ts", { rules: { "pumped/no-implicit-tag-read": { allowImplicit: ["traceTag"] } } })).toEqual([])
  })

  it("finds naked globals inside factory bodies", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const stamped = atom({ name: "stamped", factory: () => Date.now() })
    `)).toEqual(["pumped/no-ambient-io-outside-boundary", "pumped/no-naked-globals"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const created = atom({ name: "created", factory: () => new Date() })
    `)).toEqual(["pumped/no-naked-globals"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const roll = atom({ name: "roll", factory: () => Math.random() })
    `)).toEqual(["pumped/no-ambient-io-outside-boundary", "pumped/no-naked-globals"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const configured = atom({ name: "configured", factory: () => process.env.API_KEY })
    `)).toEqual(["pumped/no-naked-globals"])

    expect(ids(`
      import { readFileSync } from "node:fs"
      import { atom } from "@pumped-fn/lite"

      const contents = atom({ name: "contents", factory: () => readFileSync("./x") })
    `)).toEqual(["pumped/no-naked-globals"])
  })

  it("allows ambient effects inside explicitly owned boundary definitions", () => {
    expect(ids(`
      import { resource } from "@pumped-fn/lite"

      const session = resource({
        name: "session",
        ownership: "boundary",
        factory: (ctx) => {
          ctx.cleanup(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
          return process.env.SESSION_ID
        },
      })
    `)).toEqual([])

    expect(ids(`
      import { resource as defineResource } from "@pumped-fn/lite"

      const session = defineResource({
        name: "session",
        ownership: "boundary",
        factory: () => Date.now(),
      })
    `)).toEqual([])

    expect(ids(`
      import * as Lite from "@pumped-fn/lite"

      const session = Lite.resource({
        name: "session",
        ownership: "boundary",
        factory: () => Math.random(),
      })
    `)).toEqual([])
  })

  it("keeps ambient effects invalid without explicit boundary ownership", () => {
    expect(ids(`
      import { resource } from "@pumped-fn/lite"

      const session = resource({
        name: "session",
        factory: () => setTimeout(() => undefined, 0),
      })
    `)).toEqual(["pumped/no-ambient-io-outside-boundary", "pumped/no-naked-globals"])

    expect(ids(`
      import { resource } from "@pumped-fn/lite"

      const session = resource({
        name: "session",
        ownership: "current",
        factory: () => setTimeout(() => undefined, 0),
      })
    `)).toEqual(["pumped/no-ambient-io-outside-boundary", "pumped/no-naked-globals"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const session = atom({
        name: "session",
        ownership: "boundary",
        factory: () => setTimeout(() => undefined, 0),
      })
    `)).toEqual(["pumped/no-ambient-io-outside-boundary", "pumped/no-naked-globals"])
  })

  it("keeps ambient effects outside the boundary factory or inside nested creators invalid", () => {
    expect(ids(`
      import { resource } from "@pumped-fn/lite"

      const session = resource({
        name: process.env.SESSION_NAME,
        ownership: "boundary",
        factory: () => "session",
      })
    `)).toEqual(["pumped/no-naked-globals"])

    expect(ids(`
      import { atom, resource } from "@pumped-fn/lite"

      const session = resource({
        name: "session",
        ownership: "boundary",
        factory: () => atom({
          name: "nested",
          factory: () => setTimeout(() => undefined, 0),
        }),
      })
    `)).toEqual(["pumped/no-ambient-io-outside-boundary", "pumped/no-naked-globals"])
  })

  it("allows naked globals outside factory bodies and via the allowlist", () => {
    expect(ids(`
      const stamped = Date.now()
    `)).toEqual(["pumped/no-ambient-io-outside-boundary"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const roll = atom({ name: "roll", factory: () => Math.random() })
    `, "src/example.ts", { rules: { "pumped/no-naked-globals": { allowGlobals: ["Math.random"] } } })).toEqual(["pumped/no-ambient-io-outside-boundary"])
  })

  it("extends the composition-root path convention via compositionPaths", () => {
    const options: ScanOptions = { compositionPaths: ["(?:^|/)(?:probe-[^/]+|smoke-edge)\\.[cm]?[jt]s$"] }
    const probeSource = `
      const startedAt = Date.now()
      export async function runProbe(url: string) {
        await fetch(url)
        return startedAt
      }
    `

    expect(ids(probeSource, "src/probe-gateway.ts", options)).toEqual([])
    expect(ids(probeSource, "src/probe-gateway.ts")).toEqual([
      "pumped/no-ambient-io-outside-boundary",
      "pumped/no-ambient-io-outside-boundary",
    ])
    expect(ids(probeSource, "src/feature.ts", options)).toEqual([
      "pumped/no-ambient-io-outside-boundary",
      "pumped/no-ambient-io-outside-boundary",
    ])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      export function makeStore() {
        return atom({ name: "store", factory: () => new Map<string, string>() })
      }
    `, "src/probe-gateway.ts", options)).toEqual(["pumped/no-handle-factory"])
  })

  it("finds module-level mutable state in graph files", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      let counter = 0
      const bump = atom({ name: "bump", factory: () => ++counter })
    `)).toEqual(["pumped/no-module-state"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      export const registry = new Map<string, number>()
      const size = atom({ name: "size", factory: () => registry.size })
    `)).toEqual(["pumped/no-module-state"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const cache = { hits: 0 }
      const bumpHits = atom({ name: "bumpHits", factory: () => cache.hits++ })
    `)).toEqual(["pumped/no-module-state"])
  })

  it("allows frozen or unreferenced module-level containers, and let in non-graph files", () => {
    expect(ids(`
      let plain = 0
      plain += 1
    `)).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      export const config = Object.freeze({ retries: 3 })
      const retries = atom({ name: "retries", factory: () => config.retries })
    `)).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const localOnly = { count: 0 }
      const store = atom({ name: "store", factory: () => 0 })
    `)).toEqual([])
  })

  it("allows exported graph namespaces and binding tuples without Object.freeze", () => {
    expect(ids(`
      import { flow, resource, tag } from "@pumped-fn/lite"
      import * as session from "@pumped-fn/sdk/session"

      const port = tag<unknown>({ label: "port" })
      const run = flow({ name: "run", factory: () => "ok" })
      const tx = resource({ name: "tx", ownership: "current", factory: () => ({}) })
      export const graph = { port, nested: { run, tx } }
      export const bindings = [port(run), session.store.load(run)] as const
    `)).toEqual([])

    expect(ids(`
      import { flow } from "@pumped-fn/lite"

      const run = flow({ name: "run", factory: () => "ok" })
      export const mixed = { run, cache: new Map() }
      export const data = { retries: 3 }
      export const empty = {}
      export const spread = { ...mixed }
    `)).toEqual([
      "pumped/no-module-state",
      "pumped/no-module-state",
      "pumped/no-module-state",
      "pumped/no-module-state",
    ])
  })

  it("finds resource/flow factories reading deps via an identifier instead of destructuring", () => {
    expect(ids(`
      import { resource } from "@pumped-fn/lite"

      const tx = resource({
        name: "tx",
        ownership: "current",
        factory: (ctx, deps) => deps.store,
      })
    `)).toEqual(["pumped/prefer-destructured-deps"])

    expect(ids(`
      import { flow, typed } from "@pumped-fn/lite"

      export const save = flow({
        name: "save",
        parse: typed<{ key: string }>(),
        factory: (ctx, deps) => deps.tx.save(ctx.input.key),
      })
    `)).toEqual(["pumped/prefer-destructured-deps"])
  })

  it("allows destructured deps params, no second param, and identifiers only passed through whole", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({ name: "store", factory: (ctx, { config }) => config.retries })
    `)).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({ name: "store", factory: (ctx) => ctx.input })
    `)).toEqual([])

    expect(ids(`
      import { resource } from "@pumped-fn/lite"

      function forward(deps: unknown) {
        return deps
      }

      const tx = resource({
        name: "tx",
        ownership: "current",
        factory: (ctx, deps) => forward(deps),
      })
    `)).toEqual([])
  })

  it("detects closure references to identifiers containing $ via AST instead of regex", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const cache$ = { hits: 0 }
      const bumpHits = atom({ name: "bumpHits", factory: () => cache$.hits++ })
    `)).toEqual(["pumped/no-module-state"])
  })

  it("does not treat string/template literal text matching an in-scope identifier as a closure reference", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const localOnly = { count: 0 }
      const label = atom({ name: "label", factory: () => "localOnly count is high" })
      const templated = atom({ name: "templated", factory: () => \`localOnly\` })
    `)).toEqual([])
  })

  it("resolves an identifier-referenced deps object for no-implicit-tag-read", () => {
    expect(ids(`
      import { atom, tags } from "@pumped-fn/lite"

      const sharedDeps = { id: tags.required(requestIdTag) }

      const requestId = atom({
        name: "requestId",
        deps: sharedDeps,
        factory: (ctx) => ctx.data.seekTag(requestIdTag),
      })
    `)).toEqual([])
  })

  it("resolves spread deps that include a resolvable shared identifier", () => {
    expect(ids(`
      import { atom, tags } from "@pumped-fn/lite"

      const sharedDeps = { id: tags.required(requestIdTag) }

      const requestId = atom({
        name: "requestId",
        deps: { ...sharedDeps, foo: tags.required(fooTag) },
        factory: (ctx) => ctx.data.seekTag(requestIdTag) || ctx.data.seekTag(fooTag),
      })
    `)).toEqual([])
  })

  it("resolves aliased and namespaced tags helper imports", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"
      import { required as req } from "../tags"

      const requestId = atom({
        name: "requestId",
        deps: { id: req(requestIdTag) },
        factory: (ctx) => ctx.data.seekTag(requestIdTag),
      })
    `)).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"
      import * as T from "../tags"

      const requestId = atom({
        name: "requestId",
        deps: { id: T.required(requestIdTag) },
        factory: (ctx) => ctx.data.seekTag(requestIdTag),
      })
    `)).toEqual([])
  })

  it("skips no-implicit-tag-read when the deps shape is unresolvable, preferring false negatives", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"
      import { sharedDeps } from "./deps"

      const requestId = atom({
        name: "requestId",
        deps: sharedDeps,
        factory: (ctx) => ctx.data.seekTag(requestIdTag),
      })
    `)).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const requestId = atom({
        name: "requestId",
        deps: buildDeps(),
        factory: (ctx) => ctx.data.seekTag(requestIdTag),
      })
    `)).toEqual([])
  })

  it("escalates a warn-default rule to error via per-rule severity override", () => {
    const result = diagnostics(`
      import { atom } from "@pumped-fn/lite"

      const roll = atom({ name: "roll", factory: () => Math.random() })
    `, "src/example.ts", { rules: { "pumped/no-naked-globals": { severity: "error" } } })

    const nakedGlobal = result.find((diagnostic) => diagnostic.ruleId === "pumped/no-naked-globals")
    expect(nakedGlobal?.severity).toBe("error")
  })

  it("finds untyped throws inside atom/flow/resource factories", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        name: "store",
        factory: () => {
          throw new Error("bad")
        },
      })
    `)).toEqual(["pumped/no-untyped-throw"])

    expect(ids(`
      import { resource } from "@pumped-fn/lite"

      const tx = resource({
        name: "tx",
        ownership: "current",
        factory: () => {
          throw new TypeError("bad")
        },
      })
    `)).toEqual(["pumped/no-untyped-throw"])

    expect(ids(`
      import { flow, typed } from "@pumped-fn/lite"

      export const save = flow({
        name: "save",
        parse: typed<{ key: string }>(),
        factory: () => {
          throw new RangeError("bad")
        },
      })
    `)).toEqual(["pumped/no-untyped-throw"])
  })

  it("allows typed domain errors, rethrows, and non-factory throws", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      class StoreError extends Error {}

      const store = atom({
        name: "store",
        factory: () => {
          throw new StoreError("bad")
        },
      })
    `)).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        name: "store",
        factory: () => {
          try {
            return risky()
          } catch (error) {
            throw error
          }
        },
      })
    `)).toEqual([])

    expect(ids(`
      throw new Error("outside a factory")
    `)).toEqual([])
  })

  it("allows builtin throws via allowBuiltins config", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        name: "store",
        factory: () => {
          throw new TypeError("bad")
        },
      })
    `, "src/example.ts", { rules: { "pumped/no-untyped-throw": { allowBuiltins: ["TypeError"] } } })).toEqual([])
  })

  it("finds swallowed errors inside factory catch clauses", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        name: "store",
        factory: () => {
          try {
            return risky()
          } catch (error) {
          }
        },
      })
    `)).toEqual(["pumped/no-swallowed-error"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        name: "store",
        factory: () => {
          try {
            return risky()
          } catch {
            return null
          }
        },
      })
    `)).toEqual(["pumped/no-swallowed-error"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        name: "store",
        factory: () => {
          try {
            return risky()
          } catch (error) {
            console.log("ignored")
          }
        },
      })
    `)).toEqual(["pumped/no-swallowed-error"])
  })

  it("allows factory catch clauses that rethrow, wrap with cause, or otherwise reference the error", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({
        name: "store",
        factory: () => {
          try {
            return risky()
          } catch (error) {
            throw error
          }
        },
      })
    `)).toEqual([])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      class StoreError extends Error {}

      const store = atom({
        name: "store",
        factory: () => {
          try {
            return risky()
          } catch (error) {
            throw new StoreError("wrapped", error)
          }
        },
      })
    `)).toEqual([])

    expect(ids(`
      import { atom, controller } from "@pumped-fn/lite"

      const logger = atom({ name: "logger", factory: () => console })

      const store = atom({
        name: "store",
        deps: { logger },
        factory: (ctx, { logger }) => {
          try {
            return risky()
          } catch (error) {
            logger.error(error)
            return null
          }
        },
      })
    `)).toEqual([])

    expect(ids(`
      const value = (() => {
        try {
          return risky()
        } catch (error) {
        }
      })()
    `)).toEqual([])
  })

  it("silences a rule entirely via severity: off", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const roll = atom({ name: "roll", factory: () => Math.random() })
    `, "src/example.ts", { rules: { "pumped/no-naked-globals": { severity: "off" } } })).toEqual([
      "pumped/no-ambient-io-outside-boundary",
    ])
  })

  it("finds handle spreads that retrofit a tags property onto a same-file creator result", () => {
    expect(ids(`
      import { flow } from "@pumped-fn/lite"

      const expireBookings = flow({ name: "expire", factory: () => "ok" })

      export default {
        ...expireBookings,
        tags: [],
      }
    `)).toEqual(["pumped/no-handle-spread"])
  })

  it("finds handle spreads retrofitting tags onto an imported flow handle", () => {
    expect(ids(`
      import { expireBookings } from "./shared"

      export default {
        ...expireBookings,
        tags: [...(expireBookings.tags ?? []), { kind: "schedule" }],
      }
    `)).toEqual(["pumped/no-handle-spread"])
  })

  it("finds a bare spread of a same-file creator result even without a tags property", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const store = atom({ name: "store", factory: () => ({}) })

      const copy = { ...store }
    `)).toEqual(["pumped/no-handle-spread"])
  })

  it("allows plain data object spreads with no tags property and no local creator handle", () => {
    expect(ids(`
      const base = { a: 1, b: 2 }
      const merged = { ...base, c: 3 }
    `)).toEqual([])
  })

  it("allows plain data object spreads that happen to also set unrelated fields", () => {
    expect(ids(`
      import { flow } from "@pumped-fn/lite"

      const defaults = { timeout: 100 }

      const config = { ...defaults, retries: 3 }

      const job = flow({ name: "job", factory: () => "ok" })
    `)).toEqual([])
  })

  it("finds exported handle factories through direct, wrapped, and local returns", () => {
    expect(ids(`
      import { flow } from "@pumped-fn/lite"
      import { model } from "@pumped-fn/sdk"

      export function direct() {
        return flow({ factory: () => "ok" })
      }

      export const wrapped = () => model(flow({ factory: () => "ok" }))

      export function local() {
        const run = flow({ factory: () => "ok" })
        return model(run)
      }

      function internal() {
        return flow({ factory: () => "ok" })
      }
    `)).toEqual([
      "pumped/no-handle-factory",
      "pumped/no-handle-factory",
      "pumped/no-handle-factory",
    ])
  })

  it("allows configured core handle constructors", () => {
    expect(ids(`
      import { flow } from "@pumped-fn/lite"

      export function cliWorker(options: { name: string }) {
        return flow({ name: options.name, factory: () => "ok" })
      }
    `, "src/example.ts", {
      rules: {
        "pumped/no-handle-factory": { allowHandleFactories: ["cliWorker"] },
        "pumped/config-via-tags": { allowHandleFactories: ["cliWorker"] },
      },
    })).toEqual([])
  })

  it("finds provider options closed over by graph factories", () => {
    const found = diagnostics(`
      import { flow } from "@pumped-fn/lite"

      export function provider(options: { model: string }) {
        return flow({ factory: () => options.model })
      }
    `)
    expect(found.map((diagnostic) => diagnostic.ruleId)).toEqual([
      "pumped/no-handle-factory",
      "pumped/config-via-tags",
    ])
    expect(found[0]?.severity).toBe("error")
    expect(found[1]?.severity).toBe("warn")
  })

  function unattributedAwaitCount(source: string, filePath = "src/example.ts") {
    return ids(source, filePath).filter((id) => id === "pumped/no-unattributed-await").length
  }

  it("finds an awaited call on a destructured deps binding with no step tag", () => {
    expect(ids(`
      import { flow } from "@pumped-fn/lite"

      const sendReminder = flow({
        name: "sendReminder",
        factory: async (ctx, { mailer }) => {
          await mailer.send(ctx.input)
        },
      })
    `)).toEqual(["pumped/no-unattributed-await"])
  })

  it("finds an awaited member call rooted at a plain deps identifier param", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"

      const sendReminder = flow({
        name: "sendReminder",
        factory: async (ctx, deps) => {
          await deps.mailer.send(ctx.input)
        },
      })
    `)).toBe(1)
  })

  it("finds an awaited member call in an atom factory's deps binding", () => {
    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const cache = atom({
        factory: async (ctx, { source }) => {
          await source.warm()
        },
      })
    `)).toEqual(["pumped/no-unattributed-await"])
  })

  it("finds a .then() chained directly on a deps-rooted call with no step tag", () => {
    expect(ids(`
      import { flow } from "@pumped-fn/lite"

      const run = flow({
        name: "run",
        factory: (ctx, { mailer }) => {
          return mailer.send(ctx.input).then(() => "done")
        },
      })
    `)).toEqual(["pumped/no-unattributed-await"])
  })

  it("allows an awaited deps call inside a step-tagged flow", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"
      import { step } from "@pumped-fn/sdk"

      const sendReminder = flow({
        name: "sendReminder",
        tags: [step({ workflow: true, kind: "email" })],
        factory: async (ctx, { mailer }) => {
          await mailer.send(ctx.input)
        },
      })
    `)).toBe(0)
  })

  it("allows graph machinery ops (exec/execStream/resolve) on deps handles untagged", () => {
    expect(unattributedAwaitCount(`
      import { controller, flow } from "@pumped-fn/lite"
      import { store, worker } from "./ports"

      const run = flow({
        name: "run",
        deps: { handle: controller(worker), ctrl: controller(store, { resolve: true }) },
        factory: async (ctx, { handle, ctrl }) => {
          await handle.exec({ input: ctx.input })
          await handle.execStream({ input: ctx.input })
          await ctrl.resolve()
        },
      })
    `)).toBe(0)
  })

  it("flags non-projected dep member exec calls untagged", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"
      import { createGateway } from "./ports"

      const run = flow({
        name: "run",
        deps: { gateway: createGateway() },
        factory: async (ctx, { gateway }) => {
          await gateway.send.exec({ params: [ctx.input] })
        },
      })
    `)).toBe(1)
  })

  it("flags resolve on a dep that is not a controller", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"
      import { dns } from "./ports"

      const lookup = flow({
        name: "lookup",
        deps: { dns },
        factory: async (ctx, { dns }) => await dns.resolve(ctx.input),
      })
    `)).toBe(1)
  })

  it("flags resolve when controller is not the lite import", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"
      import { controller, dns } from "./ports"

      const lookup = flow({
        name: "lookup",
        deps: { dns: controller(dns) },
        factory: async (ctx, { dns }) => await dns.resolve(ctx.input),
      })
    `)).toBe(1)
  })

  it("flags resolve when the lite controller import is shadowed", () => {
    expect(unattributedAwaitCount(`
      import { controller, flow } from "@pumped-fn/lite"
      import { dns } from "./ports"

      const controller = (value) => value

      const lookup = flow({
        name: "lookup",
        deps: { dns: controller(dns) },
        factory: async (ctx, { dns }) => await dns.resolve(ctx.input),
      })
    `)).toBe(1)
  })

  it("allows resolve through an undestructured deps parameter backed by a controller", () => {
    expect(unattributedAwaitCount(`
      import { controller, flow } from "@pumped-fn/lite"
      import { store } from "./ports"

      const run = flow({
        name: "run",
        deps: { ctrl: controller(store, { resolve: true }) },
        factory: async (_ctx, deps) => {
          await deps.ctrl.resolve()
        },
      })
    `)).toBe(0)
  })

  it("allows for-await iteration over a deps-bound iterable", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"

      const intake = flow({
        name: "intake",
        factory: async (ctx, { lines }) => {
          for await (const line of lines) {
            void line
          }
        },
      })
    `)).toBe(0)
  })

  it("allows Promise.all over handle execs mapped from a deps binding", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"

      const run = flow({
        name: "run",
        factory: async (ctx, { models }) => {
          await Promise.all(models.map((handle) => handle.exec({ input: ctx.input })))
        },
      })
    `)).toBe(0)
  })

  it("allows ctx.exec since ctx is a receiver, not a deps binding", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"

      const run = flow({
        name: "run",
        factory: async (ctx, { childFlow }) => {
          await ctx.exec({ input: ctx.input })
        },
      })
    `)).toBe(0)
  })

  it("allows an awaited call on an imported helper", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"
      import { parse } from "./util"

      const run = flow({
        name: "run",
        factory: async (ctx, { mailer }) => {
          await parse(ctx.input)
        },
      })
    `)).toBe(0)
  })

  it("allows a sync call on a deps binding", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"

      const run = flow({
        name: "run",
        factory: (ctx, { ledger }) => {
          return ledger.find((item) => item.id === ctx.input.id)
        },
      })
    `)).toBe(0)
  })

  it("allows an awaited call when the deps binding is shadowed by a nested function parameter", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"

      const run = flow({
        name: "run",
        factory: async (ctx, { mailer }) => {
          async function relay(mailer) {
            await mailer.send(ctx.input)
          }
          await relay({ send: async () => {} })
        },
      })
    `)).toBe(0)
  })

  it("exempts test paths from no-unattributed-await", () => {
    expect(unattributedAwaitCount(`
      import { flow } from "@pumped-fn/lite"

      const sendReminder = flow({
        name: "sendReminder",
        factory: async (ctx, { mailer }) => {
          await mailer.send(ctx.input)
        },
      })
    `, "tests/example.test.ts")).toBe(0)
  })

  it("requires ctx.exec callbacks to receive every execution input explicitly", () => {
    const hidden = (source: string) => diagnostics(source)
      .filter((diagnostic) => diagnostic.ruleId === "pumped/no-hidden-exec-dependencies")

    expect(hidden(`
      import { flow } from "@pumped-fn/lite"
      import { client } from "./ports"

      const send = flow({
        deps: { client },
        factory: (ctx, { client }) => ctx.exec({ fn: () => client.send(msg), name: "client.send", params: [] }),
      })
    `).map((diagnostic) => diagnostic.message)).toEqual([
      'ctx.exec callback captures "client, msg"; declare graph values in deps and provide runtime values through params.',
    ])

    expect(hidden(`
      import { flow } from "@pumped-fn/lite"

      const send = flow({
        factory: (ctx) => {
          const client = { send: (message: string) => message }
          return ctx.exec({ name: "client.send", fn: () => client.send("hello"), params: [client] })
        },
      })
    `)).toHaveLength(1)

    expect(hidden(`
      import { flow } from "@pumped-fn/lite"

      const send = flow({
        factory: (ctx) => ctx.exec({
          name: "target.send",
          fn: (target, content) => {
            const relay = ({ value }: { value: string }) => target.send(value)
            return relay({ value: content })
          },
          params: [{ send: (value: string) => value }, "hello"],
        }),
      })
    `)).toEqual([])

    expect(hidden(`
      import { flow } from "@pumped-fn/lite"

      const send = flow({
        factory: (ctx) => ctx.exec({ name: "promise.resolve", fn: () => Promise.resolve("ok"), params: [] }),
      })
    `)).toEqual([])

    expect(hidden(`
      import { flow } from "@pumped-fn/lite"

      const unrelated = (Promise: { resolve: (value: string) => string }) => Promise.resolve("elsewhere")
      const send = flow({
        factory: (ctx) => ctx.exec({ name: "promise.resolve", fn: () => Promise.resolve("ok"), params: [] }),
      })
    `)).toEqual([])

    expect(hidden(`
      import { flow } from "@pumped-fn/lite"

      const Promise = { resolve: (value: string) => value }
      const send = flow({
        factory: (ctx) => ctx.exec({ name: "promise.resolve", fn: () => Promise.resolve("ok"), params: [] }),
      })
    `).map((diagnostic) => diagnostic.message)).toEqual([
      'ctx.exec callback captures "Promise"; declare graph values in deps and provide runtime values through params.',
    ])

    expect(hidden(`
      import { flow } from "@pumped-fn/lite"

      const send = flow({
        factory: (ctx, { Promise }: { Promise: { resolve: (value: string) => string } }) =>
          ctx.exec({ name: "promise.resolve", fn: () => Promise.resolve("ok"), params: [] }),
      })
    `).map((diagnostic) => diagnostic.message)).toEqual([
      'ctx.exec callback captures "Promise"; declare graph values in deps and provide runtime values through params.',
    ])

    expect(hidden(`
      import { flow } from "@pumped-fn/lite"

      const send = flow({
        factory: (ctx) => ctx.exec({ name: "crypto.randomUUID", fn: () => crypto.randomUUID(), params: [] }),
      })
    `).map((diagnostic) => diagnostic.message)).toEqual([
      'ctx.exec callback captures "crypto"; declare graph values in deps and provide runtime values through params.',
    ])

    expect(hidden(`
      import { flow } from "@pumped-fn/lite"

      const worker = { exec: (_options: unknown) => undefined }
      const send = flow({
        factory: () => worker.exec({ fn: () => Promise.resolve("ok"), params: [] }),
      })
    `)).toEqual([])
  })

  it("requires the shared inline execution contract on both receivers", () => {
    const missing = diagnostics(`
      import { createScope, flow } from "@pumped-fn/lite"

      const operation = flow({
        factory: (ctx) => ctx.exec({ fn: () => "ctx" }),
      })
      const scope = createScope()
      scope.run({ fn: () => "scope" })
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-hidden-exec-dependencies")
      .map((diagnostic) => diagnostic.message)

    expect(missing).toEqual([
      'ctx.exec inline options require name and params; missing "name, params".',
      'scope.run inline options require name and params; missing "name, params".',
    ])

    expect(diagnostics(`
      import { createScope, flow } from "@pumped-fn/lite"

      const operation = flow({
        factory: (ctx) => ctx.exec({
          name: "ctx-argument",
          params: [ctx],
          fn: (_ctx) => "invalid",
        }),
      })
      const scope = createScope()
      scope.run({
        name: "scope-argument",
        params: [scope],
        fn: () => "invalid",
      })
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-ctx-argument" || diagnostic.ruleId === "pumped/no-scope-argument")
      .map((diagnostic) => diagnostic.message)).toEqual([
      "ctx is a receiver, never an argument; reify the contract as a flow reached via deps.",
      "ctx is a receiver, never an argument; reify the contract as a flow reached via deps.",
      "Do not pass scope through inline execution params; declare the operation dependencies in deps.",
    ])
  })

  it("audits local identifier callbacks and fails closed on unresolved identifiers", () => {
    expect(diagnostics(`
      import { createScope, flow } from "@pumped-fn/lite"

      const transform = (value: string) => value.toUpperCase()
      function finish() { return "done" }
      const operation = flow({
        factory: (ctx) => ctx.exec({
          name: "transform",
          params: ["value"],
          fn: transform,
        }),
      })
      const scope = createScope()
      scope.run({ name: "finish", params: [], fn: finish })
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-hidden-exec-dependencies")).toEqual([])

    expect(diagnostics(`
      import { flow } from "@pumped-fn/lite"
      import { importedCallback } from "./callback"

      const client = { send: (value: string) => value }
      const message = "hello"
      const captured = () => client.send(message)
      const operation = flow({
        factory: (ctx) => {
          void ctx.exec({ name: "captured", params: [], fn: captured })
          return ctx.exec({ name: "imported", params: [], fn: importedCallback })
        },
      })
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-hidden-exec-dependencies")
      .map((diagnostic) => diagnostic.message)).toEqual([
      'ctx.exec callback captures "client, message"; declare graph values in deps and provide runtime values through params.',
      'ctx.exec callback "importedCallback" cannot be inspected; use a local function or inline callback.',
    ])
  })

  it("requires inline scope operations to declare graph deps and runtime params", () => {
    const hidden = (source: string) => diagnostics(source)
      .filter((diagnostic) => diagnostic.ruleId === "pumped/no-hidden-exec-dependencies")

    expect(hidden(`
      import { createScope, resource } from "@pumped-fn/lite"

      const client = resource({ factory: () => ({ send: (value: string) => value }) })
      const message = "hello"
      const scope = createScope()
      scope.run({
        name: "send-once",
        deps: { client },
        params: [],
        fn: ({ client }) => client.send(message),
      })
    `).map((diagnostic) => diagnostic.message)).toEqual([
      'scope.run callback captures "message"; declare graph values in deps and provide runtime values through params.',
    ])

    expect(hidden(`
      import { createScope, resource } from "@pumped-fn/lite"

      const client = resource({ factory: () => ({ send: (value: string) => value }) })
      const message = "hello"
      const scope = createScope()
      scope.run({
        name: "send-once",
        deps: { client },
        params: [message],
        fn: ({ client }, message) => client.send(message),
      })
    `)).toEqual([])

    expect(hidden(`
      const message = "hello"
      const runner = { run: (_options: unknown) => undefined }
      runner.run({
        name: "unrelated",
        params: [],
        fn: () => message,
      })
    `)).toEqual([])

    expect(hidden(`
      import { createScope } from "@pumped-fn/lite"

      const scope = createScope()
      const message = "hello"
      const unrelated = (scope: { run: (options: unknown) => void }) => scope.run({
        name: "unrelated",
        params: [],
        fn: () => message,
      })
      unrelated({ run: () => undefined })
    `)).toEqual([])

    expect(diagnostics(`
      import { atom, createScope } from "@pumped-fn/lite"

      const value = atom({ factory: () => "value" })
      const scope = createScope()
      scope.run({
        name: "scope-reach",
        params: [{ scope }],
        fn: ({ scope }) => scope.resolve(value),
      })
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-scope-argument")
      .map((diagnostic) => diagnostic.message)).toEqual([
      "Do not pass scope through inline execution params; declare the operation dependencies in deps.",
    ])

    expect(diagnostics(`
      import { createScope } from "@pumped-fn/lite"

      const scope = createScope()
      scope.run({
        name: "transform",
        params: [(scope: string) => scope.toUpperCase()],
        fn: (transform) => transform("value"),
      })
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-scope-argument"))
      .toEqual([])

    expect(diagnostics(`
      import { createScope } from "@pumped-fn/lite"

      const scope = createScope()
      const ctx = scope.createContext()
      scope.run({
        name: "context-reach",
        params: [{ ctx }],
        fn: ({ ctx }) => ctx.close(),
      })
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-ctx-argument")
      .map((diagnostic) => diagnostic.message)).toEqual([
      "ctx is a receiver, never an argument; reify the contract as a flow reached via deps.",
    ])

    expect(diagnostics(`
      import { createScope } from "@pumped-fn/lite"

      const scope = createScope()
      scope.run({
        name: "transform-context",
        params: [(ctx: string) => ctx.toUpperCase()],
        fn: (transform) => transform("value"),
      })
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-ctx-argument"))
      .toEqual([])

    expect(diagnostics(`
      import { createScope } from "@pumped-fn/lite"

      const scope = createScope()
      const ctx = scope.createContext()
      scope.run({
        name: "property-names",
        params: [{ scope: "request", ctx: "request" }, { scope: "request" }.scope],
        fn: (request, scopeName) => request.scope + request.ctx + scopeName,
      })
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-scope-argument" || diagnostic.ruleId === "pumped/no-ctx-argument"))
      .toEqual([])

    expect(diagnostics(`
      import { createScope } from "@pumped-fn/lite"

      const scope = createScope()
      const unrelated = (scope: string) => scope.toUpperCase()
      scope.run({
        name: "scope-reach-with-unrelated-binding",
        params: [scope],
        fn: (scope) => scope.dispose(),
      })
      unrelated("value")
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-scope-argument")
      .map((diagnostic) => diagnostic.message)).toEqual([
      "Do not pass scope through inline execution params; declare the operation dependencies in deps.",
    ])

    expect(diagnostics(`
      import { createScope } from "@pumped-fn/lite"

      const first = () => {
        const scope = createScope()
        const ctx = scope.createContext()
        return scope.run({
          name: "first-context",
          params: [{ ctx }],
          fn: ({ ctx }) => ctx.close(),
        })
      }
      const second = () => {
        const scope = createScope()
        const ctx = scope.createContext()
        return scope.run({
          name: "second-context",
          params: [{ ctx }],
          fn: ({ ctx }) => ctx.close(),
        })
      }
      void first
      void second
    `).filter((diagnostic) => diagnostic.ruleId === "pumped/no-ctx-argument"))
      .toHaveLength(2)
  })

})
