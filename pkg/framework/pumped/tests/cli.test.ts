import { flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { runCli } from "../src/runtime/cli"
import { command } from "../src/tags"
import { entry, manifest } from "./helpers"

const greet = flow({
  parse: typed<{ name: string }>(),
  tags: [command({ name: "greet", description: "say hello" })],
  factory: (ctx) => ({ message: `hello ${ctx.input.name}` }),
})

const boom = flow({
  factory: () => {
    throw new Error("boom")
  },
})

class Forbidden extends Error {}
class Conflict extends Error {}
class NotFound extends Error {}

const forbidden = flow({
  tags: [command({ name: "forbidden" })],
  factory: () => {
    throw new Forbidden("nope")
  },
})

const conflict = flow({
  tags: [command({ name: "conflict" })],
  factory: () => {
    throw new Conflict("nope")
  },
})

const notFound = flow({
  tags: [command({ name: "not-found" })],
  factory: () => {
    throw new NotFound("nope")
  },
})

function mapError(error: unknown): { status: number; body: unknown } | undefined {
  if (error instanceof Forbidden) return { status: 403, body: { kind: "forbidden" } }
  if (error instanceof Conflict) return { status: 409, body: { kind: "conflict" } }
  if (error instanceof NotFound) return { status: 404, body: { kind: "not-found" } }
  return undefined
}

describe("runCli", () => {
  it("runs a matched command with --json input and prints the output", async () => {
    const lines: string[] = []
    await runCli(manifest(undefined, entry("cli", "greet", greet)), ["greet", "--json", JSON.stringify({ name: "ada" })], {
      out: (line) => lines.push(line),
      err: () => {},
    })

    expect(lines).toEqual([JSON.stringify({ message: "hello ada" })])
  })

  it("closes with ok:false and sets exitCode on flow failure", async () => {
    const errors: string[] = []
    const originalExitCode = process.exitCode

    await runCli(manifest(undefined, entry("cli", "boom", boom)), ["boom"], { out: () => {}, err: (line) => errors.push(line) })

    expect(process.exitCode).toBe(1)
    expect(errors).toEqual(["boom"])

    process.exitCode = originalExitCode
  })

  it("reports invalid --json input via err() and sets exitCode without creating a scope", async () => {
    const lines: string[] = []
    const errors: string[] = []
    const originalExitCode = process.exitCode

    await runCli(manifest(undefined, entry("cli", "greet", greet)), ["greet", "--json", "{not valid json"], {
      out: (line) => lines.push(line),
      err: (line) => errors.push(line),
    })

    expect(lines).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/invalid --json payload/)
    expect(process.exitCode).toBe(1)

    process.exitCode = originalExitCode
  })

  it.each([
    ["forbidden", forbidden, { kind: "forbidden" }, 3],
    ["conflict", conflict, { kind: "conflict" }, 4],
    ["not-found", notFound, { kind: "not-found" }, 5],
  ] as const)("maps a %s failure to the mapped body and derived exit code", async (name, mappedFlow, body, exitCode) => {
    const errors: string[] = []
    const originalExitCode = process.exitCode

    await runCli(manifest({ mapError }, entry("cli", name, mappedFlow)), [name], { out: () => {}, err: (line) => errors.push(line) })

    expect(errors).toEqual([JSON.stringify(body)])
    expect(process.exitCode).toBe(exitCode)

    process.exitCode = originalExitCode
  })

  it("keeps the unmapped path (raw message, exit code 1) when mapError returns undefined", async () => {
    const errors: string[] = []
    const originalExitCode = process.exitCode

    await runCli(manifest({ mapError: () => undefined }, entry("cli", "boom", boom)), ["boom"], {
      out: () => {},
      err: (line) => errors.push(line),
    })

    expect(errors).toEqual(["boom"])
    expect(process.exitCode).toBe(1)

    process.exitCode = originalExitCode
  })
})
