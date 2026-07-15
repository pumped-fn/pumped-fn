import { createScope } from "@pumped-fn/lite"
import { abortSignal } from "@pumped-fn/sdk"
import * as sandbox from "@pumped-fn/sdk/sandbox"
import * as session from "@pumped-fn/sdk/session"
import { expect, it } from "vitest"
import {
  OutputLimitError,
  authority as bashAuthority,
  binding,
  config,
  engine,
  readiness,
  workspace,
} from "../src/index"

it("runs read, write, and buffered exec through named sandbox flows", async () => {
  const authority = sandboxAuthority()
  const policy = sandboxPolicy()
  const scope = createScope({
    tags: [
      sandbox.policy(policy),
      config.engine({ options: { files: { "/workspace/input.txt": "ready" } } }),
      config.workspace({ root: "/workspace" }),
      binding.read,
      binding.write,
      binding.run,
    ],
  })
  const ctx = context(scope, "session-a", authority)

  await ctx.resolve(session.session)
  const physical = await ctx.resolve(engine)
  await expect(ctx.resolve(workspace)).resolves.toMatchObject({ root: "/workspace", bash: physical })
  await expect(ctx.resolve(readiness)).resolves.toEqual({
    authorityFingerprint: authority.fingerprint,
    root: "/workspace",
  })
  await expect(ctx.exec({
    flow: sandbox.read,
    input: { path: "/workspace/input.txt" },
  })).resolves.toBe("ready")
  await expect(ctx.exec({
    flow: sandbox.write,
    input: { path: "/workspace/output.txt", content: "written" },
  })).resolves.toBeUndefined()
  await expect(ctx.exec({
    flow: sandbox.read,
    input: { path: "/workspace/output.txt" },
  })).resolves.toBe("written")

  const stream = ctx.execStream({
    flow: sandbox.exec,
    input: { command: "printf", args: ["streamed"] },
  })
  const events: sandbox.ExecEvent[] = []
  for await (const event of stream) events.push(event)
  expect(events).toEqual([{ type: "stdout", content: "streamed" }])
  await expect(stream.result).resolves.toEqual({ stdout: "streamed", stderr: "", exitCode: 0 })

  await ctx.close()
  await scope.dispose()
})

it("denies authority and policy violations before resolving the physical engine", async () => {
  let creates = 0
  const authority = sandboxAuthority({ write: false, commands: [] })
  const scope = createScope({
    tags: [
      sandbox.policy({ ...sandboxPolicy(), write: true, commands: [] }),
      config.engine({
        create: (options) => {
          creates++
          throw new Error(`engine should not resolve: ${String(options.cwd)}`)
        },
      }),
      config.workspace({ root: "/workspace" }),
      binding.read,
      binding.write,
      binding.run,
    ],
  })
  const ctx = context(scope, "session-a", authority)

  await expect(ctx.exec({
    flow: sandbox.write,
    input: { path: "/workspace/blocked.txt", content: "blocked" },
  })).rejects.toThrow("write exceeds session authority")
  expect(creates).toBe(0)

  await ctx.close({ ok: false, error: new Error("expected") })
  await scope.dispose()
})

it("rejects output above the declared byte cap", async () => {
  const authority = sandboxAuthority()
  const scope = createScope({
    tags: [
      sandbox.policy({ ...sandboxPolicy(), maxOutputBytes: 4 }),
      config.engine({}),
      config.workspace({ root: "/workspace" }),
      binding.read,
      binding.write,
      binding.run,
    ],
  })
  const ctx = context(scope, "session-a", authority)

  await ctx.resolve(session.session)
  await ctx.resolve(workspace)
  const stream = ctx.execStream({
    flow: sandbox.exec,
    input: { command: "printf", args: ["12345"] },
  })
  await expect(async () => {
    for await (const _event of stream) void _event
  }).rejects.toBeInstanceOf(OutputLimitError)
  await expect(stream.result).rejects.toBeInstanceOf(OutputLimitError)

  await ctx.close({ ok: false, error: new Error("expected") })
  await scope.dispose()
})

it("settles cancellation in session A without closing session B", async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const controller = new AbortController()
  const authority = sandboxAuthority({ commands: ["printf", "sleep"] })
  const scope = createScope({
    tags: [
      sandbox.policy({ ...sandboxPolicy(), commands: ["printf", "sleep"] }),
      config.engine({ options: { sleep: () => held } }),
      config.workspace({ root: "/workspace" }),
      binding.read,
      binding.write,
      binding.run,
    ],
  })
  const sessionA = context(scope, "session-a", authority, [abortSignal(controller.signal)])
  const sessionB = context(scope, "session-b", authority)
  await sessionA.resolve(session.session)
  await sessionB.resolve(session.session)
  const engineA = await sessionA.resolve(engine)
  const engineB = await sessionB.resolve(engine)
  expect(engineA).not.toBe(engineB)
  await sessionA.resolve(workspace)
  await sessionB.resolve(workspace)

  const waiting = sessionA.exec({
    flow: sandbox.exec,
    input: { command: "sleep", args: ["1"] },
  })
  await Promise.resolve()
  controller.abort(new Error("steered"))
  release()
  await expect(waiting).rejects.toThrow("steered")
  await expect(sessionB.exec({
    flow: sandbox.exec,
    input: { command: "printf", args: ["alive"] },
  })).resolves.toEqual({ stdout: "alive", stderr: "", exitCode: 0 })

  await sessionA.close({ ok: false, error: new Error("expected") })
  await sessionB.close()
  await scope.dispose()
})

function context(
  scope: ReturnType<typeof createScope>,
  id: string,
  authority: session.Authority,
  tags: ReturnType<typeof abortSignal>[] = [],
) {
  return scope.createContext({
    tags: [
      session.authority(authority),
      session.record(sessionRecord(id, authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      ...tags,
    ],
  })
}

function sandboxAuthority(overrides: Partial<session.SandboxAuthority> = {}): session.Authority {
  return session.createAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    permissions: [],
    tools: [],
    sandbox: {
      roots: ["/workspace"],
      commands: ["printf"],
      write: true,
      network: false,
      ...overrides,
    },
  })
}

function sandboxPolicy(): sandbox.Policy {
  return {
    roots: ["/workspace"],
    write: true,
    network: false,
    commands: ["printf"],
    timeoutMs: 1_000,
    maxOutputBytes: 1_024,
  }
}

function sessionRecord(id: string, authority: session.Authority): session.SessionRecord {
  return {
    id,
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
