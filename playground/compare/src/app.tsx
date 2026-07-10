import {
  SandpackCodeEditor,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  useSandpack,
} from "@codesandbox/sandpack-react"
import { sandboxDependencies, sandboxFiles } from "./sandbox-files"

const lanes = [
  {
    id: "pumped-fn",
    label: "pumped-fn",
    model: "Execution graph",
    composition: "resource + flow deps",
    request: "required request tags",
    failure: "typed flow fault",
    cleanup: "root-owned resource",
    file: "/cases/account-onboarding/lanes/pumped.ts",
    source: "workspace source",
  },
  {
    id: "effect",
    label: "Effect",
    model: "Program model",
    composition: "Effect.Service + Layer",
    request: "Context services",
    failure: "Effect error channel",
    cleanup: "scoped Layer",
    file: "/cases/account-onboarding/lanes/effect.ts",
    source: "official example",
    href: "https://github.com/Effect-TS/examples/tree/91e24b045af2bcdbeb2e78e075825ed20a0038a7/examples/http-server",
  },
  {
    id: "awilix",
    label: "Awilix",
    model: "DI container",
    composition: "strict proxy cradle",
    request: "child-scope values",
    failure: "Outcome union",
    cleanup: "singleton disposer",
    file: "/cases/account-onboarding/lanes/awilix.ts",
    source: "official repository",
    href: "https://github.com/jeffijoe/awilix/tree/f72d175ddb950c3f13ef41e8be98b24471d59900",
  },
  {
    id: "inversify",
    label: "Inversify",
    model: "Decorator DI",
    composition: "@injectable + Container",
    request: "child-container bindings",
    failure: "Outcome union",
    cleanup: "singleton deactivation",
    file: "/cases/account-onboarding/lanes/inversify.ts",
    source: "official monorepo",
    href: "https://github.com/inversify/monorepo/tree/7c605a9bd99e9cb8b611f65a53e6d940cb0f0e1e",
  },
  {
    id: "plain",
    label: "Plain TS",
    model: "Closure baseline",
    composition: "manual construction",
    request: "function arguments",
    failure: "Outcome union",
    cleanup: "explicit close",
    file: "/cases/account-onboarding/lanes/plain.ts",
    source: "control lane",
  },
] as const

const axes = [
  { label: "Model", key: "model" },
  { label: "Composition", key: "composition" },
  { label: "Request facts", key: "request" },
  { label: "Expected failure", key: "failure" },
  { label: "Cleanup", key: "cleanup" },
] as const

const steps = [
  ["01", "Compose once", "One runtime per lane"],
  ["02", "Provision", "Acquire once, return the user"],
  ["03", "Duplicate", "Rollback with a typed outcome"],
  ["04", "Fresh request", "Use new actor and request facts"],
  ["05", "Close once", "Release the database"],
] as const

function ComparisonGuide() {
  const { sandpack } = useSandpack()

  return (
    <>
      <section className="scenario" aria-labelledby="scenario-title">
        <div className="section-heading">
          <p>Shared executable contract</p>
          <h2 id="scenario-title">Account onboarding, including the lifecycle</h2>
        </div>
        <ol className="scenario-steps">
          {steps.map(([number, title, detail]) => (
            <li key={number}>
              <span>{number}</span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </li>
          ))}
        </ol>
      </section>

      <section className="comparison" aria-labelledby="comparison-title">
        <div className="section-heading">
          <p>Side by side</p>
          <h2 id="comparison-title">Same behavior, native composition</h2>
          <span>Choose a lane to open its exact checked-in source below.</span>
        </div>
        <div className="matrix" role="table" aria-label="Dependency model comparison">
          <div className="matrix-row matrix-header" role="row">
            <div role="columnheader">Axis</div>
            {lanes.map((lane) => (
              <div role="columnheader" key={lane.id} data-active={sandpack.activeFile === lane.file}>
                <button type="button" onClick={() => sandpack.openFile(lane.file)}>
                  {lane.label}
                </button>
                {"href" in lane ? <a href={lane.href}>{lane.source}</a> : <span>{lane.source}</span>}
              </div>
            ))}
          </div>
          {axes.map((axis) => (
            <div className="matrix-row" role="row" key={axis.key}>
              <div role="rowheader">{axis.label}</div>
              {lanes.map((lane) => <div role="cell" key={lane.id}>{lane[axis.key]}</div>)}
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-heading" id="workspace" aria-labelledby="workspace-title">
        <div className="section-heading">
          <p>Editable proof</p>
          <h2 id="workspace-title">Change a lane. Rerun the contract.</h2>
          <span>The preview executes the same scenario module as the Node suite.</span>
        </div>
      </section>
    </>
  )
}

export function App() {
  return (
    <main>
      <header className="hero">
        <p>pumped-fn comparison lab</p>
        <h1>One contract.<br />Five dependency models.</h1>
        <p>Inspect the wiring, run the same lifecycle, and decide from executable source—not a rewritten snippet.</p>
        <div className="hero-proof">
          <span>4 libraries + 1 control</span>
          <span>3 requests per lane</span>
          <span>1 acquire / 1 release</span>
        </div>
      </header>
      <section className="lab" aria-label="Comparison runtime">
        <SandpackProvider
          template="vanilla-ts"
          files={sandboxFiles}
          customSetup={{ dependencies: sandboxDependencies, entry: "/sandbox/main.ts" }}
          options={{
            activeFile: "/cases/account-onboarding/lanes/pumped.ts",
            initMode: "immediate",
            visibleFiles: [
              "/cases/account-onboarding/lanes/pumped.ts",
              "/cases/account-onboarding/lanes/effect.ts",
              "/cases/account-onboarding/lanes/awilix.ts",
              "/cases/account-onboarding/lanes/inversify.ts",
              "/cases/account-onboarding/lanes/plain.ts",
              "/cases/account-onboarding/scenario.ts",
              "/cases/account-onboarding/contract.ts",
              "/cases/account-onboarding/fixture.ts",
            ],
          }}
        >
          <ComparisonGuide />
          <SandpackLayout>
            <SandpackCodeEditor showLineNumbers />
            <SandpackPreview showOpenInCodeSandbox={false} showRefreshButton />
          </SandpackLayout>
        </SandpackProvider>
      </section>
    </main>
  )
}
