import { createScope, flow, typed } from "@pumped-fn/lite"
import { expect, it } from "vitest"
import * as sandbox from "../src/sandbox"
import * as session from "../src/session"

it("does not mark exact UTF-8 boundaries or empty output as truncated", async () => {
  const run = outputFlow(["é", "é", ""], { stdout: "é", stderr: "ab", exitCode: 0 })
  const { scope, ctx } = sandboxContext(run, 4)
  const output = await capture(ctx)

  expect(output).toEqual({
    events: [
      { type: "stdout", content: "é" },
      { type: "stdout", content: "é" },
    ],
    result: { stdout: "é", stderr: "ab", exitCode: 0 },
  })

  await ctx.close()
  await scope.dispose()
})

it("marks the first shortened event and cuts before a split code point", async () => {
  const run = outputFlow(["a", "💥", "later"], { stdout: "a💥", stderr: "later", exitCode: 0 })
  const { scope, ctx } = sandboxContext(run, 4)
  const output = await capture(ctx)

  expect(output).toEqual({
    events: [
      { type: "stdout", content: "a" },
      { type: "stdout", content: "", truncated: true },
    ],
    result: { stdout: "a", stderr: "", exitCode: 0, truncated: true },
  })
  expect(new TextEncoder().encode(output.result.stdout).byteLength).toBeLessThanOrEqual(4)

  await ctx.close()
  await scope.dispose()
})

it("preserves a binding-reported truncation with empty content", async () => {
  const run = flow({
    name: "verify-401.sandbox.reported",
    parse: typed<sandbox.ExecInput>(),
    factory: async function* (): AsyncGenerator<sandbox.CommandOutputEvent, sandbox.ExecResult, unknown> {
      yield { type: "stderr", content: "", truncated: true }
      return { stdout: "", stderr: "", exitCode: 0 }
    },
  })
  const { scope, ctx } = sandboxContext(run, 4)

  await expect(capture(ctx)).resolves.toEqual({
    events: [{ type: "stderr", content: "", truncated: true }],
    result: { stdout: "", stderr: "", exitCode: 0, truncated: true },
  })

  await ctx.close()
  await scope.dispose()
})

function outputFlow(chunks: readonly string[], result: sandbox.ExecResult): sandbox.Run {
  return flow({
    name: "verify-401.sandbox.output",
    parse: typed<sandbox.ExecInput>(),
    factory: async function* (): AsyncGenerator<sandbox.CommandOutputEvent, sandbox.ExecResult, unknown> {
      for (const content of chunks) yield { type: "stdout", content }
      return result
    },
  })
}

function sandboxContext(run: sandbox.Run, maxOutputBytes: number) {
  const authority = session.createAuthority({
    tenant: "verify-401",
    roots: ["/workspace"],
    permissions: [],
    tools: [],
    sandbox: { roots: ["/workspace"], commands: ["run"], write: false, network: false },
  })
  const scope = createScope({ tags: [
    session.authority(authority),
    session.record(initialRecord(authority)),
    session.clock({ now: () => "2026-08-05T00:00:00.000Z" }),
    sandbox.policy({
      roots: ["/workspace"],
      write: false,
      network: false,
      commands: ["run"],
      timeoutMs: 1_000,
      maxOutputBytes,
    }),
    sandbox.impl.run(run),
  ] })
  return { scope, ctx: scope.createContext() }
}

async function capture(ctx: ReturnType<ReturnType<typeof createScope>["createContext"]>) {
  const stream = ctx.execStream({ flow: sandbox.exec, input: { command: "run" } })
  const events: sandbox.CommandOutputEvent[] = []
  for await (const event of stream) events.push(event)
  return { events, result: await stream.result }
}

function initialRecord(authority: session.Authority): session.SessionRecord {
  return {
    id: "verify-401",
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
    currentBranchId: "main",
    branches: [{
      id: "main",
      version: 0,
      createdBy: "root",
      authorityFingerprint: authority.fingerprint,
      authority,
      evidence: [],
    }],
    work: [],
    attempts: [],
    invocations: [],
    artifacts: [],
    memory: [],
    schedules: [],
    providerContinuations: {},
    nextEventSequence: 0,
  }
}
