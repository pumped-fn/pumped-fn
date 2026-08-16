import { atom, controller, flow, preset, tag, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { analyze } from "../src/analyze"
import { app } from "../src/app"
import { command, httpRequest, route, workflow } from "../src/tags"
import { manifest, manifestEntry } from "./helpers"

describe("analyze", () => {
  it("reports roots, declared dependencies, tag reads, providers, and opaque factories", () => {
    const region = tag<string>({ label: "example.graph.region" })
    const directory = atom({ factory: () => ({ displayName: (name: string) => name }) })
    const greet = flow({
      parse: typed<{ name: string }>(),
      deps: { directory, region: tags.required(region) },
      factory: (context, { directory, region }) => `${directory.displayName(context.input.name)}:${region}`,
    })
    const report = analyze(
      manifest(
        app({ tags: [[region("default")]] }),
        manifestEntry("greet", greet, [route({ method: "GET", path: "/greet" })])
      )
    )

    expect(report.nodes).toEqual([
      { id: "app", kind: "app", label: "app" },
      { id: "tag:example.graph.region", kind: "tag", label: "example.graph.region" },
      { id: "root:greet", kind: "root", label: "greet" },
      { id: "tag:pumped.route", kind: "tag", label: "pumped.route" },
      { id: "flow:greet", kind: "flow", label: "greet" },
      { id: "atom:directory", kind: "atom", label: "directory" },
    ])
    expect(report.edges).toEqual([
      { from: "app", to: "tag:example.graph.region", kind: "provides-tag" },
      { from: "root:greet", to: "tag:pumped.route", kind: "provides-tag" },
      { from: "flow:greet", to: "atom:directory", kind: "depends-on", key: "directory" },
      {
        from: "flow:greet",
        to: "tag:example.graph.region",
        kind: "reads-tag",
        key: "region",
        mode: "required",
      },
      { from: "root:greet", to: "flow:greet", kind: "executes" },
    ])
    expect(report.unknowns).toEqual([
      { from: "flow:greet", reason: "factory-body" },
      { from: "atom:directory", reason: "factory-body" },
    ])
    expect(report.failures).toEqual([])
    expect(report.idOf(greet)).toBe("flow:greet")
    expect(report.idOf(directory)).toBe("atom:directory")
    expect(report.idOf(region)).toBe("tag:example.graph.region")
  })

  it("deduplicates a shared flow reached from two roots", () => {
    const shared = flow({ name: "shared", factory: () => "ok" })
    const report = analyze(
      manifest(
        undefined,
        manifestEntry("shared", shared, [route({ method: "GET", path: "/shared" })]),
        manifestEntry("shared", shared, [command({ name: "shared" })])
      )
    )

    expect(report.nodes.filter((node) => node.kind === "flow")).toEqual([
      { id: "flow:shared", kind: "flow", label: "shared" },
    ])
    expect(report.edges.filter((edge) => edge.kind === "executes")).toEqual([
      { from: "root:shared", to: "flow:shared", kind: "executes" },
      { from: "root:shared-2", to: "flow:shared", kind: "executes" },
    ])
  })

  it("follows flow implementors supplied through tags", () => {
    const implementation = flow({
      name: "implementation",
      parse: typed<string>(),
      factory: (context) => context.input,
    })
    const model = tag<typeof implementation>({ label: "example.graph.model" })
    const run = flow({
      name: "run",
      deps: { model: tags.required(model) },
      factory: (_context, { model }) => model.exec({ input: "ok" }),
    })
    const report = analyze(
      manifest(app({ tags: model(implementation) }), manifestEntry("run", run, [command({ name: "run" })]))
    )

    expect(report.edges).toContainEqual({
      from: "tag:example.graph.model",
      to: "flow:implementation",
      kind: "implemented-by",
    })
    expect(report.failures).toEqual([])
    expect(report.idOf(implementation)).toBe("flow:implementation")
  })

  it("accepts a required tag provided along the path through a flow controller", () => {
    const implementation = flow({ name: "implementation", factory: () => "ok" })
    const model = tag<typeof implementation>({ label: "example.graph.model" })
    const child = flow({
      name: "child",
      deps: { model: tags.required(model) },
      factory: (_context, { model }) => model.exec(),
    })
    const parent = flow({
      name: "parent",
      deps: { child: controller(child, { tags: model(implementation) }) },
      factory: (_context, { child }) => child.exec(),
    })
    const report = analyze(
      manifest(undefined, manifestEntry("parent", parent, [route({ method: "POST", path: "/parent" })]))
    )

    expect(report.edges).toContainEqual({
      from: "flow:parent",
      to: "tag:example.graph.model",
      kind: "provides-tag",
    })
    expect(report.failures).toEqual([])
  })

  it("marks function preset replacements as opaque", () => {
    const target = flow({ name: "target", factory: () => "target" })
    const report = analyze(manifest(app({ presets: [preset(target, () => "replacement")] })))

    expect(report.unknowns).toContainEqual({ from: "flow:target", reason: "preset-factory" })
  })

  it("fails an entry whose tags match no host", () => {
    const marker = tag<string>({ label: "example.orphan" })
    const orphan = flow({ factory: () => "ok" })
    const report = analyze(manifest(undefined, manifestEntry("orphan", orphan, [marker("value")])))

    expect(report.failures).toEqual([
      {
        code: "no-host",
        entry: "orphan",
        message: 'entry "orphan" in virtual carries no tag any host mounts',
      },
    ])
  })

  it("fails duplicate routes and duplicate commands across entries", () => {
    const first = flow({ name: "first", factory: () => "ok" })
    const second = flow({ name: "second", factory: () => "ok" })
    const report = analyze(
      manifest(
        undefined,
        manifestEntry("first", first, [route({ method: "GET", path: "/same" }), command({ name: "same" })]),
        manifestEntry("second", second, [route({ method: "GET", path: "/same" }), command({ name: "same" })])
      )
    )

    expect(report.failures).toContainEqual(
      expect.objectContaining({ code: "duplicate-route", entry: "second" })
    )
    expect(report.failures).toContainEqual(
      expect.objectContaining({ code: "duplicate-command", entry: "second" })
    )
  })

  it("fails a required host tag only for the hosts that never provide it", () => {
    const show = flow({
      name: "show",
      deps: { request: tags.required(httpRequest) },
      factory: (_context, { request }) => request.url,
    })
    const report = analyze(
      manifest(
        undefined,
        manifestEntry("show", show, [route({ method: "GET", path: "/show" }), command({ name: "show" })])
      )
    )

    expect(report.failures).toEqual([
      {
        code: "missing-required-tag",
        entry: "show",
        host: "cli",
        tag: "pumped.http.request",
        message:
          'entry "show" requires tag "pumped.http.request" but host "cli" does not provide it and no app, entry, or default supplies it',
      },
    ])
  })

  it("accepts a required tag provided by the entry's own tags or by a default", () => {
    const tenant = tag<string>({ label: "example.tenant" })
    const fallback = tag<string>({ label: "example.fallback", default: "backup" })
    const show = flow({
      name: "show",
      deps: { tenant: tags.required(tenant), fallback: tags.required(fallback) },
      factory: (_context, deps) => `${deps.tenant}:${deps.fallback}`,
    })
    const report = analyze(
      manifest(undefined, manifestEntry("show", show, [command({ name: "show" }), tenant("acme")]))
    )

    expect(report.failures).toEqual([])
  })

  it("checks a required tag read by an atom against app tags only", () => {
    const region = tag<string>({ label: "example.atom.region" })
    const store = atom({
      deps: { region: tags.required(region) },
      factory: (_context, { region }) => region,
    })
    const show = flow({
      name: "show",
      deps: { store },
      factory: (_context, { store }) => store,
    })
    const failing = analyze(
      manifest(undefined, manifestEntry("show", show, [command({ name: "show" }), region("entry-level")]))
    )
    const passing = analyze(
      manifest(app({ tags: region("app-level") }), manifestEntry("show", show, [command({ name: "show" })]))
    )

    expect(failing.failures).toEqual([
      expect.objectContaining({ code: "missing-required-tag", entry: "show", tag: "example.atom.region" }),
    ])
    expect(passing.failures).toEqual([])
  })

  it("accepts an entry flow that declares typed faults", () => {
    const store = atom({ factory: () => ({ read: (id: string) => id }) })
    const readItem = flow({
      name: "readItem",
      parse: typed<{ id: string }>(),
      faults: typed<{ kind: "not-found"; id: string }>(),
      deps: { store },
      factory: (context, { store }) =>
        context.input.id === ""
          ? context.fail({ kind: "not-found", id: context.input.id })
          : store.read(context.input.id),
    })
    const report = analyze(manifest(app(), manifestEntry("read-item", readItem, [workflow({})])))

    const flowId = report.idOf(readItem)

    expect(flowId).toBe("flow:read-item")
    expect(report.edges).toContainEqual({ from: flowId, to: "atom:store", kind: "depends-on", key: "store" })
  })
})
