import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { analyze } from "../src/analyze"
import { app } from "../src/app"

describe("analyze", () => {
  it("reports roots, declared dependencies, tag reads, providers, and opaque factories", () => {
    const region = tag<string>({ label: "example.graph.region" })
    const directory = atom({ factory: () => ({ displayName: (name: string) => name }) })
    const greet = flow({
      parse: typed<{ name: string }>(),
      deps: { directory, region: tags.required(region) },
      factory: (context, { directory, region }) => `${directory.displayName(context.input.name)}:${region}`,
    })
    const report = analyze({
      app: app({ tags: [region("default")] }),
      entries: [{ kind: "server", name: "greet", file: "src/server/greet.ts", flow: greet }],
    })

    expect(report.nodes).toEqual([
      { id: "app", kind: "app", label: "app" },
      { id: "tag:example.graph.region", kind: "tag", label: "example.graph.region" },
      { id: "root:server:greet", kind: "root", label: "greet" },
      { id: "flow:greet", kind: "flow", label: "greet" },
      { id: "atom:directory", kind: "atom", label: "directory" },
    ])
    expect(report.edges).toEqual([
      { from: "app", to: "tag:example.graph.region", kind: "provides-tag" },
      { from: "flow:greet", to: "atom:directory", kind: "depends-on", key: "directory" },
      {
        from: "flow:greet",
        to: "tag:example.graph.region",
        kind: "reads-tag",
        key: "region",
        mode: "required",
      },
      { from: "root:server:greet", to: "flow:greet", kind: "executes" },
    ])
    expect(report.unknowns).toEqual([
      { from: "flow:greet", reason: "factory-body" },
      { from: "atom:directory", reason: "factory-body" },
    ])
    expect(report.idOf(greet)).toBe("flow:greet")
    expect(report.idOf(directory)).toBe("atom:directory")
    expect(report.idOf(region)).toBe("tag:example.graph.region")
  })

  it("deduplicates a shared flow reached from two roots", () => {
    const shared = flow({ name: "shared", factory: () => "ok" })
    const report = analyze({
      app: undefined,
      entries: [
        { kind: "server", name: "shared", file: "src/server/shared.ts", flow: shared },
        { kind: "cli", name: "shared", file: "src/cli/shared.ts", flow: shared },
      ],
    })

    expect(report.nodes.filter((node) => node.kind === "flow")).toEqual([
      { id: "flow:shared", kind: "flow", label: "shared" },
    ])
    expect(report.edges.filter((edge) => edge.kind === "executes")).toEqual([
      { from: "root:server:shared", to: "flow:shared", kind: "executes" },
      { from: "root:cli:shared", to: "flow:shared", kind: "executes" },
    ])
  })
})
