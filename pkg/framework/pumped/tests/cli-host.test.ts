import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { cliHost, type CliIo } from "../src/hosts/cli"
import { cliInvocation, command } from "../src/tags"
import { manifest, manifestEntry } from "./helpers"

const greet = flow({
  parse: typed<{ name: string }>(),
  factory: (ctx) => ({ message: `hello ${ctx.input.name}` }),
})

const boom = flow({
  factory: () => {
    throw new Error("boom")
  },
})

function collect(): CliIo & { lines: string[]; errors: string[] } {
  const lines: string[] = []
  const errors: string[] = []
  return { lines, errors, out: (line) => lines.push(line), err: (line) => errors.push(line) }
}

async function run(argv: string[], ...entries: Parameters<typeof manifest>[1][]): Promise<{ code: number; io: ReturnType<typeof collect> }> {
  const io = collect()
  const scope = createScope({})
  const runtime = cliHost.start({ scope, manifest: manifest(undefined, ...entries), argv, io })
  const code = await runtime.code
  await scope.dispose()
  return { code, io }
}

describe("cliHost", () => {
  it("runs a matched command with --json input and prints the output", async () => {
    const { code, io } = await run(
      ["greet", "--json", JSON.stringify({ name: "ada" })],
      manifestEntry("greet", greet, [command({ name: "greet", description: "say hello" })])
    )

    expect(code).toBe(0)
    expect(io.lines).toEqual([JSON.stringify({ message: "hello ada" })])
  })

  it("accepts the --json=payload form", async () => {
    const { code, io } = await run(
      ["greet", `--json=${JSON.stringify({ name: "ada" })}`],
      manifestEntry("greet", greet, [command({ name: "greet" })])
    )

    expect(code).toBe(0)
    expect(io.lines).toEqual([JSON.stringify({ message: "hello ada" })])
  })

  it("prints usage from the frozen specs for --help and no arguments", async () => {
    const entries = manifestEntry("greet", greet, [command({ name: "greet", description: "say hello" })])

    const help = await run(["--help"], entries)
    expect(help.code).toBe(0)
    expect(help.io.lines.join("\n")).toContain("greet  say hello")

    const bare = await run([], entries)
    expect(bare.code).toBe(0)
    expect(bare.io.lines.join("\n")).toContain("greet")
  })

  it("exits 2 for an unknown command, naming the available ones", async () => {
    const { code, io } = await run(["missing"], manifestEntry("greet", greet, [command({ name: "greet" })]))

    expect(code).toBe(2)
    expect(io.errors[0]).toBe('unknown command "missing"')
    expect(io.errors.join("\n")).toContain("greet")
  })

  it("exits 2 for an invalid --json payload without creating a context", async () => {
    const { code, io } = await run(
      ["greet", "--json", "{not valid json"],
      manifestEntry("greet", greet, [command({ name: "greet" })])
    )

    expect(code).toBe(2)
    expect(io.lines).toEqual([])
    expect(io.errors[0]).toMatch(/invalid --json payload/)
  })

  it("exits 3 with the fault JSON for a FlowFault", async () => {
    const faulty = flow({
      faults: typed<{ kind: "locked" }>(),
      factory: (ctx) => ctx.fail({ kind: "locked" }),
    })
    const { code, io } = await run(["faulty"], manifestEntry("faulty", faulty, [command({ name: "faulty" })]))

    expect(code).toBe(3)
    expect(io.errors).toEqual([JSON.stringify({ fault: { kind: "locked" } })])
  })

  it("exits 1 with the raw message for an unmapped failure", async () => {
    const { code, io } = await run(["boom"], manifestEntry("boom", boom, [command({ name: "boom" })]))

    expect(code).toBe(1)
    expect(io.errors).toEqual(["boom"])
  })

  it("seeds the invocation and the entry's own tags into the context", async () => {
    const describeInvocation = flow({
      deps: { invocation: tags.required(cliInvocation) },
      factory: (_ctx, deps) => ({ command: deps.invocation.command, argv: deps.invocation.argv }),
    })
    const { code, io } = await run(
      ["describe", "--json", "null"],
      manifestEntry("describe", describeInvocation, [command({ name: "describe" })])
    )

    expect(code).toBe(0)
    expect(JSON.parse(io.lines[0] as string)).toEqual({
      command: "describe",
      argv: ["describe", "--json", "null"],
    })
  })

  it("prints help for --help after a command instead of executing the flow", async () => {
    let executed = 0
    const effectful = flow({
      factory: () => {
        executed += 1
        return { done: true }
      },
    })
    const { code, io } = await run(["deploy", "--help"], manifestEntry("deploy", effectful, [command({ name: "deploy" })]))

    expect(code).toBe(0)
    expect(executed).toBe(0)
    expect(io.lines.join("\n")).toContain("deploy")
  })

  it("rejects unknown options instead of silently running the flow", async () => {
    let executed = 0
    const effectful = flow({
      factory: () => {
        executed += 1
        return { done: true }
      },
    })
    const { code, io } = await run(
      ["greet", "--jsno", "{}"],
      manifestEntry("greet", effectful, [command({ name: "greet" })])
    )

    expect(code).toBe(2)
    expect(executed).toBe(0)
    expect(io.errors[0]).toBe('unknown option "--jsno"')
  })

  it("refuses duplicate command names at start", () => {
    const scope = createScope({})

    expect(() =>
      cliHost.start({
        scope,
        manifest: manifest(
          undefined,
          manifestEntry("first", greet, [command({ name: "same" })]),
          manifestEntry("second", boom, [command({ name: "same" })])
        ),
        argv: [],
      })
    ).toThrow('duplicate command "same": first, second')
  })
})
