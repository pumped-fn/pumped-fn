import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { scanPaths, scanText } from "../src/index"

function ids(source: string, filePath = "src/example.ts") {
  return scanText(source, filePath).map((diagnostic) => diagnostic.ruleId)
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

  it("finds definition handle prefixes and suffixes", () => {
    expect(ids(`
      import { atom, flow, resource, tag } from "@pumped-fn/lite"
      import { scopedValue } from "@pumped-fn/lite-react"

      const atomStore = atom({ factory: () => new Map<string, string>() })
      const saveFlow = flow({ factory: () => "ok" })
      const resourceTx = resource({ factory: () => ({}) })
      const requestTag = tag<string>({ label: "request.id" })
      const scopedValueForm = scopedValue({ initialValue: { name: "" } })
    `, "src/example.tsx")).toEqual([
      "pumped/no-definition-handle-suffix",
      "pumped/no-definition-handle-suffix",
      "pumped/no-definition-handle-suffix",
      "pumped/no-definition-handle-suffix",
      "pumped/no-definition-handle-suffix",
    ])
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
})
