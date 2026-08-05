import { createScope, flow, typed } from "@pumped-fn/lite"
import { expect, it } from "vitest"
import * as sandbox from "../src/sandbox"
import * as session from "../src/session"

it("signals the deadline and withholds the result after an uncooperative binding finishes", async () => {
  let release!: () => void
  let reportAbort!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const aborted = new Promise<void>((resolve) => {
    reportAbort = resolve
  })
  const run = flow({
    name: "review.sandbox.late-output",
    parse: typed<sandbox.ExecInput>(),
    factory: async function* (ctx): AsyncGenerator<sandbox.CommandOutputEvent, sandbox.ExecResult, unknown> {
      ctx.signal.addEventListener("abort", reportAbort, { once: true })
      await held
      yield { type: "stdout", content: "after-timeout-1" }
      yield { type: "stderr", content: "after-timeout-2" }
      return { stdout: "after-timeout-1", stderr: "after-timeout-2", exitCode: 0 }
    },
  })
  const { scope, ctx } = sandboxContext(run, 10, 1_024)
  const stream = ctx.execStream({ flow: sandbox.exec, input: { command: "wait" } })
  const outcome = (async () => {
    for await (const _event of stream) {
    }
    return stream.result
  })()

  await aborted
  const settled = await Promise.race([
    outcome.catch((error: unknown) => error),
    new Promise<"pending">((resolve) => setTimeout(resolve, 250, "pending")),
  ])
  expect(settled).toBe("pending")

  release()
  await expect(outcome).rejects.toThrow("Sandbox command timed out after 10ms")

  await ctx.close({ ok: false, error: new Error("expected") })
  await scope.dispose()
})

it("marks complete-code-point UTF-8 truncation on events and results", async () => {
  const run = flow({
    name: "review.sandbox.utf8-output",
    parse: typed<sandbox.ExecInput>(),
    factory: async function* (ctx): AsyncGenerator<sandbox.CommandOutputEvent, sandbox.ExecResult, unknown> {
      const variant = ctx.input.args?.[0]
      const content = variant === "long" ? "aéz" : "a"
      yield { type: "stdout", content, ...(variant === "reported-event" ? { truncated: true } : {}) }
      return {
        stdout: content,
        stderr: "",
        exitCode: 0,
        ...(variant === "reported-result" ? { truncated: true } : {}),
      }
    },
  })
  const { scope, ctx } = sandboxContext(run, 1_000, 2)

  const complete = await capture(ctx, "complete")
  const truncated = await capture(ctx, "long")
  const reportedEvent = await capture(ctx, "reported-event")
  const reportedResult = await capture(ctx, "reported-result")

  expect(complete).toEqual({
    events: [{ type: "stdout", content: "a" }],
    result: { stdout: "a", stderr: "", exitCode: 0 },
  })
  expect(truncated).toEqual({
    events: [{ type: "stdout", content: "a", truncated: true }],
    result: { stdout: "a", stderr: "", exitCode: 0, truncated: true },
  })
  expect(reportedEvent).toEqual({
    events: [{ type: "stdout", content: "a", truncated: true }],
    result: { stdout: "a", stderr: "", exitCode: 0, truncated: true },
  })
  expect(reportedResult).toEqual({
    events: [{ type: "stdout", content: "a" }],
    result: { stdout: "a", stderr: "", exitCode: 0, truncated: true },
  })

  await ctx.close()
  await scope.dispose()
})

function sandboxContext(run: sandbox.Run, timeoutMs: number, maxOutputBytes: number) {
  const authority = session.createAuthority({
    tenant: "review-sandbox",
    roots: ["/workspace"],
    permissions: [],
    tools: [],
    sandbox: { roots: ["/workspace"], commands: ["wait"], write: false, network: false },
  })
  const scope = createScope({ tags: [
    session.authority(authority),
    session.record(initialRecord(authority)),
    session.clock({ now: () => "2026-08-05T00:00:00.000Z" }),
    sandbox.policy({
      roots: ["/workspace"],
      write: false,
      network: false,
      commands: ["wait"],
      timeoutMs,
      maxOutputBytes,
    }),
    sandbox.impl.run(run),
  ] })
  return { scope, ctx: scope.createContext() }
}

async function capture(ctx: ReturnType<ReturnType<typeof createScope>["createContext"]>, variant: string) {
  const stream = ctx.execStream({ flow: sandbox.exec, input: { command: "wait", args: [variant] } })
  const events: sandbox.CommandOutputEvent[] = []
  for await (const event of stream) events.push(event)
  return { events, result: await stream.result }
}

function initialRecord(authority: session.Authority): session.SessionRecord {
  return {
    id: "review-sandbox",
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
