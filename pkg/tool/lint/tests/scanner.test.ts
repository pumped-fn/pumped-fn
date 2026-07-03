import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { scanPaths, scanText, type ScanOptions } from "../src/index"

function ids(source: string, filePath = "src/example.ts", options?: ScanOptions) {
  return scanText(source, filePath, options).map((diagnostic) => diagnostic.ruleId)
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

  it("finds backend and test anti-patterns", () => {
    expect(ids(`
      import { atom, flow } from "@pumped-fn/lite"
      import { vi } from "vitest"

      vi.mock("./transport")
      const profileAtom = atom({ name: "profile", factory: () => fetch("/api/profile") })
      export function runProfile(scope: Lite.Scope) {
        if (process.env.NODE_ENV === "test") return "fake"
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
      "pumped/no-direct-flow-composition",
    ])
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

  it("finds stale public vocabulary and JSDOM backend markers in text files", () => {
    expect(ids(`
      # ${["Gol", "den"].join("")} example

      Use @vitest-environment jsdom with setup.dom.ts and User.dom.test.tsx.
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
    `)).toEqual(["pumped/no-implicit-tag-read"])
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

  it("allows naked globals outside factory bodies and via the allowlist", () => {
    expect(ids(`
      const stamped = Date.now()
    `)).toEqual(["pumped/no-ambient-io-outside-boundary"])

    expect(ids(`
      import { atom } from "@pumped-fn/lite"

      const roll = atom({ name: "roll", factory: () => Math.random() })
    `, "src/example.ts", { rules: { "pumped/no-naked-globals": { allowGlobals: ["Math.random"] } } })).toEqual(["pumped/no-ambient-io-outside-boundary"])
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
})
