import { flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { runCli } from "../src/runtime/cli"
import { command } from "../src/tags"
import type { Manifest } from "../src/runtime/manifest"

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

describe("runCli", () => {
  it("runs a matched command with --json input and prints the output", async () => {
    const manifest: Manifest = {
      app: undefined,
      entries: [{ kind: "cli", name: "greet", file: "virtual", flow: greet }],
    }

    const lines: string[] = []
    await runCli(manifest, ["greet", "--json", JSON.stringify({ name: "ada" })], {
      out: (line) => lines.push(line),
      err: () => {},
    })

    expect(lines).toEqual([JSON.stringify({ message: "hello ada" })])
  })

  it("closes with ok:false and sets exitCode on flow failure", async () => {
    const manifest: Manifest = {
      app: undefined,
      entries: [{ kind: "cli", name: "boom", file: "virtual", flow: boom }],
    }

    const errors: string[] = []
    const originalExitCode = process.exitCode

    await runCli(manifest, ["boom"], { out: () => {}, err: (line) => errors.push(line) })

    expect(process.exitCode).toBe(1)
    expect(errors).toEqual(["boom"])

    process.exitCode = originalExitCode
  })
})
