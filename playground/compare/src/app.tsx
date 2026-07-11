import {
  SandpackCodeEditor,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  useSandpack,
} from "@codesandbox/sandpack-react"
import { useEffect } from "react"
import { codeTheme } from "./editor/code-theme"
import { useTypeIntel } from "./editor/type-intel"
import { sandboxDependencies, sandboxFiles } from "./sandbox-files"

type Dimension = "Build" | "Test" | "Operate"

const dimensions: Dimension[] = ["Build", "Test", "Operate"]

const dimensionLead: Record<Dimension, string> = {
  Build: "How the object graph is declared and wired.",
  Test: "How one dependency is replaced without patching a module.",
  Operate: "How execution is observed without instrumenting call sites.",
}

const lanes = [
  {
    id: "pumped-fn",
    label: "pumped-fn",
    source: "pumped-fn source",
    href: "https://github.com/pumped-fn/pumped-fn/tree/ca2a8fa3ae462129034c9f05f6630f1099955ca0",
    files: {
      Build: "/cases/account-onboarding/lanes/pumped.ts",
      Test: "/cases/account-onboarding/tests/pumped.test.ts",
      Operate: "/cases/account-onboarding/operations/pumped.test.ts",
    },
    values: {
      Build: "Graph edges declare dependencies, request facts, resource ownership, typed failure, and named side effects.",
      Test: "Replace a graph edge at createScope, then execute the same flow without patching a module.",
      Operate: "One extension observes graph execution; named child work is recorded without tracing calls in the flow.",
    },
  },
  {
    id: "effect",
    label: "Effect",
    source: "official example",
    href: "https://github.com/Effect-TS/examples/tree/91e24b045af2bcdbeb2e78e075825ed20a0038a7/examples/http-server",
    files: {
      Build: "/cases/account-onboarding/lanes/effect.ts",
      Test: "/cases/account-onboarding/tests/effect.test.ts",
      Operate: "/cases/account-onboarding/operations/effect.test.ts",
    },
    values: {
      Build: "Services and Layers build a typed program runtime with scoped acquisition and request services.",
      Test: "Provide test Layers to the same Effect service program and keep dependencies in the Effect type system.",
      Operate: "withSpan names the operation; the runtime tracer receives the completed business span.",
    },
  },
  {
    id: "awilix",
    label: "Awilix",
    source: "official repository",
    href: "https://github.com/jeffijoe/awilix/tree/f72d175ddb950c3f13ef41e8be98b24471d59900",
    files: {
      Build: "/cases/account-onboarding/lanes/awilix.ts",
      Test: "/cases/account-onboarding/tests/awilix.test.ts",
      Operate: "/cases/account-onboarding/operations/awilix.test.ts",
    },
    values: {
      Build: "A strict proxy cradle wires plain factories; registrations carry lifetime and request values.",
      Test: "Call the plain factory with an object of fakes; the unit test does not need the container.",
      Operate: "This lane injects Trace and wraps provision explicitly; container disposal remains a separate lifecycle edge.",
    },
  },
  {
    id: "inversify",
    label: "Inversify",
    source: "official monorepo",
    href: "https://github.com/inversify/monorepo/tree/7c605a9bd99e9cb8b611f65a53e6d940cb0f0e1e",
    files: {
      Build: "/cases/account-onboarding/lanes/inversify.ts",
      Test: "/cases/account-onboarding/tests/inversify.test.ts",
      Operate: "/cases/account-onboarding/operations/inversify.test.ts",
    },
    values: {
      Build: "Decorated constructors and runtime identifiers form the graph; child containers carry request facts.",
      Test: "Bind fakes in a fresh test container; identifiers and decorator metadata remain part of setup.",
      Operate: "This lane binds Trace as a dependency and wraps the provision method explicitly.",
    },
  },
  {
    id: "plain",
    label: "Plain TS",
    source: "control lane",
    href: "https://www.typescriptlang.org/",
    files: {
      Build: "/cases/account-onboarding/lanes/plain.ts",
      Test: "/cases/account-onboarding/tests/plain.test.ts",
      Operate: "/cases/account-onboarding/operations/plain.test.ts",
    },
    values: {
      Build: "Construction, request values, failure mapping, and cleanup are handwritten closures and calls.",
      Test: "Pass a fake fixture directly; the seam stays simple because the application threads it manually.",
      Operate: "Every operation boundary is explicit application code, including the Trace span around provision.",
    },
  },
] as const

const visibleFiles = lanes.flatMap((lane) => dimensions.map((dimension) => lane.files[dimension]))

const lineCounts = Object.fromEntries(
  Object.entries(sandboxFiles).map(([path, source]) => [path, source.trimEnd().split("\n").length]),
)

function wireShortcutBoundary(handler: (event: KeyboardEvent) => void): () => void {
  window.addEventListener("keydown", handler)
  return () => window.removeEventListener("keydown", handler)
}

function Comparison() {
  const { sandpack } = useSandpack()
  const selectedLane = lanes.find((lane) => dimensions.some((item) => lane.files[item] === sandpack.activeFile))!
  const dimension = dimensions.find((item) => selectedLane.files[item] === sandpack.activeFile)!
  const intel = useTypeIntel(sandpack.activeFile)

  function selectDimension(next: Dimension): void {
    sandpack.openFile(selectedLane.files[next])
  }

  function selectLane(lane: (typeof lanes)[number]): void {
    sandpack.openFile(lane.files[dimension])
  }

  useEffect(() => {
    return wireShortcutBoundary((event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof HTMLElement && event.target.closest(".cm-editor, input, textarea, select")) return
      const next = dimensions[Number.parseInt(event.key, 10) - 1]
      if (next) sandpack.openFile(selectedLane.files[next])
    })
  }, [sandpack, selectedLane])

  return (
    <>
      <section className="comparison" aria-label="Five lane comparison">
        <div className="dimension-bar">
          <div className="dimension-tabs" aria-label="Comparison dimension">
            {dimensions.map((item) => (
              <button
                aria-pressed={dimension === item}
                key={item}
                onClick={() => selectDimension(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          <p className="dimension-lead">{dimensionLead[dimension]}</p>
        </div>
        <div className="lane-grid">
          {lanes.map((lane) => (
            <article data-active={lane.id === selectedLane.id} key={lane.id}>
              <div className="lane-head">
                <button className="lane-name" onClick={() => selectLane(lane)} type="button">
                  {lane.label}
                </button>
                <span className="lane-lines">{lineCounts[lane.files[dimension]]} lines</span>
              </div>
              <p>{lane.values[dimension]}</p>
              <div className="lane-meta">
                <code>{lane.files[dimension]}</code>
                <a href={lane.href}>{lane.source}</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="source-heading" aria-labelledby="source-title">
        <div>
          <h2 id="source-title">{dimension}: {selectedLane.label}</h2>
          <p className="source-hint">
            Edit anything — the preview re-runs the shared contract. Hover a symbol for its inferred type,
            Ctrl-Space completes, keys 1·2·3 switch dimension.
          </p>
        </div>
        <div className="source-status">
          <span className="intel-status" data-live={intel !== undefined}>
            {intel === undefined ? "type intelligence warming" : "type intelligence live"}
          </span>
          <code>{selectedLane.files[dimension]}</code>
        </div>
      </section>

      <SandpackLayout>
        <SandpackCodeEditor extensions={intel} key={sandpack.activeFile} showLineNumbers showTabs={false} />
        <SandpackPreview showOpenInCodeSandbox={false} showRefreshButton />
      </SandpackLayout>
    </>
  )
}

export function App() {
  return (
    <>
      <nav className="topbar" aria-label="Site">
        <a className="wordmark" href="https://github.com/pumped-fn/pumped-fn">
          pumped-fn<span>/compare</span>
        </a>
        <div className="topbar-links">
          <a href="https://www.npmjs.com/package/@pumped-fn/lite">npm</a>
          <a href="https://github.com/pumped-fn/pumped-fn">GitHub</a>
        </div>
      </nav>
      <main>
        <header className="hero">
          <h1>Build, test, and operate the same account workflow.</h1>
          <p>
            Five checked-in implementations of one contract — pumped-fn, Effect, Awilix, Inversify, and plain
            TypeScript. Read each source with live type intelligence, edit it, and watch the shared lifecycle,
            throughput, and reactivity proofs run in your browser.
          </p>
          <dl className="contract-strip">
            <div><dt>Request 1</dt><dd>success</dd></div>
            <div><dt>Request 2</dt><dd>typed duplicate · rollback</dd></div>
            <div><dt>Request 3</dt><dd>new actor · success</dd></div>
            <div><dt>Database</dt><dd>one acquire · one release</dd></div>
          </dl>
        </header>
        <section className="lab" aria-label="Executable dependency comparison">
          <SandpackProvider
            customSetup={{ dependencies: sandboxDependencies, entry: "/sandbox/main.ts" }}
            files={sandboxFiles}
            options={{
              activeFile: "/cases/account-onboarding/lanes/pumped.ts",
              initMode: "immediate",
              visibleFiles,
            }}
            template="vanilla-ts"
            theme={codeTheme}
          >
            <Comparison />
          </SandpackProvider>
        </section>
        <footer className="footer">
          <p>
            Same black-box contract, idiomatic internals. Sources are pinned in{" "}
            <a href="https://github.com/pumped-fn/pumped-fn/blob/main/playground/compare/sources.lock.json">
              sources.lock.json
            </a>
            ; benchmarks run in this tab, on your machine.
          </p>
          <div className="footer-links">
            <a href="https://github.com/pumped-fn/pumped-fn">github.com/pumped-fn</a>
            <a href="https://www.npmjs.com/package/@pumped-fn/lite">@pumped-fn/lite</a>
          </div>
        </footer>
      </main>
    </>
  )
}
