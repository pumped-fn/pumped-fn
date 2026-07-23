import {
  Bash,
  InMemoryFs,
  type BufferEncoding,
  type FileContent,
  type WriteFileOptions,
} from "just-bash"
import { createScope } from "@pumped-fn/lite"
import * as sandbox from "@pumped-fn/sdk/sandbox"
import * as session from "@pumped-fn/sdk/session"
import { expect, it } from "vitest"
import {
  OutputLimitError,
  authority as bashAuthority,
  binding,
  config,
  engine,
  read,
  readiness,
  run,
  workspace,
  write,
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

it("enforces policy when provider flows are executed directly", async () => {
  const scope = createScope({
    tags: [
      sandbox.policy(sandboxPolicy()),
      config.engine({ options: { files: { "/workspace/input.txt": "ready" } } }),
      config.workspace({ root: "/workspace" }),
    ],
  })
  const ctx = context(scope, "session-a", sandboxAuthority())

  await expect(ctx.exec({
    flow: read,
    input: { path: "/workspace/input.txt" },
  })).resolves.toBe("ready")
  await expect(ctx.exec({
    flow: read,
    input: { path: "/outside/input.txt" },
  })).rejects.toThrow('path "/outside/input.txt" is outside allowed roots')
  await expect(ctx.exec({
    flow: write,
    input: { path: "/workspace/output.txt", content: "written" },
  })).resolves.toBeUndefined()

  const denied = ctx.execStream({
    flow: run,
    input: { command: "cat", args: ["/workspace/input.txt"] },
  })
  await expect(async () => {
    for await (const _event of denied) void _event
  }).rejects.toThrow('command "cat" is not allowed')
  await expect(denied.result).rejects.toThrow('command "cat" is not allowed')

  const allowed = ctx.execStream({
    flow: run,
    input: { command: "printf", args: ["ready"] },
  })
  const events: sandbox.ExecEvent[] = []
  for await (const event of allowed) events.push(event)
  expect(events).toEqual([{ type: "stdout", content: "ready" }])
  await expect(allowed.result).resolves.toEqual({ stdout: "ready", stderr: "", exitCode: 0 })

  await ctx.close()
  await scope.dispose()

  const readOnlyScope = createScope({
    tags: [
      sandbox.policy({ ...sandboxPolicy(), write: false }),
      config.engine({}),
      config.workspace({ root: "/workspace" }),
    ],
  })
  const readOnlyCtx = context(readOnlyScope, "session-b", sandboxAuthority())

  await expect(readOnlyCtx.exec({
    flow: write,
    input: { path: "/workspace/output.txt", content: "blocked" },
  })).rejects.toThrow("write is disabled")

  await readOnlyCtx.close()
  await readOnlyScope.dispose()
})

it("binds direct flows to the validated policy snapshot", async () => {
  const roots = ["/workspace"]
  const commands = ["printf"]
  const policy = { ...sandboxPolicy(), roots, commands, write: false }
  const scope = createScope({
    tags: [
      sandbox.policy(policy),
      config.engine({ options: { files: { "/outside/secret.txt": "secret" } } }),
      config.workspace({ root: "/workspace" }),
    ],
  })
  const ctx = context(scope, "session-a", sandboxAuthority())
  const verified = await ctx.resolve(bashAuthority)

  roots.push("/outside")
  commands.push("cat")
  policy.write = true

  expect(verified.policy).toEqual({ ...sandboxPolicy(), write: false })
  await expect(ctx.exec({
    flow: read,
    input: { path: "/outside/secret.txt" },
  })).rejects.toBeInstanceOf(sandbox.PolicyError)
  await expect(ctx.exec({
    flow: write,
    input: { path: "/workspace/output.txt", content: "blocked" },
  })).rejects.toThrow("write is disabled")
  const denied = ctx.execStream({
    flow: run,
    input: { command: "cat", args: ["/outside/secret.txt"] },
  })
  await expect(async () => {
    for await (const _event of denied) void _event
  }).rejects.toBeInstanceOf(sandbox.PolicyError)
  await expect(denied.result).rejects.toBeInstanceOf(sandbox.PolicyError)

  await ctx.close()
  await scope.dispose()
})

it("denies symlink escapes while preserving in-root and new write paths", async () => {
  const physical = new Bash({
    cwd: "/workspace",
    files: {
      "/outside/secret.txt": "secret",
      "/workspace/real/input.txt": "ready",
    },
  })
  await physical.fs.symlink("/workspace/real", "/workspace/alias")
  await physical.fs.symlink("/outside", "/workspace/leak")
  await physical.fs.symlink("/outside/secret.txt", "/workspace/secret-link")
  const scope = createScope({
    tags: [
      sandbox.policy(sandboxPolicy()),
      config.engine({ create: () => physical }),
      config.workspace({ root: "/workspace" }),
    ],
  })
  const ctx = context(scope, "session-a", sandboxAuthority())

  await expect(ctx.exec({
    flow: read,
    input: { path: "/workspace/alias/input.txt" },
  })).resolves.toBe("ready")
  await expect(ctx.exec({
    flow: write,
    input: { path: "/workspace/alias/output.txt", content: "written" },
  })).resolves.toBeUndefined()
  await expect(physical.readFile("/workspace/real/output.txt")).resolves.toBe("written")
  await expect(ctx.exec({
    flow: write,
    input: { path: "/workspace/new/deep/output.txt", content: "created" },
  })).resolves.toBeUndefined()
  await expect(physical.readFile("/workspace/new/deep/output.txt")).resolves.toBe("created")
  await expect(ctx.exec({
    flow: read,
    input: { path: "/workspace/leak/secret.txt" },
  })).rejects.toThrow('path "/outside/secret.txt" is outside allowed roots')
  await expect(ctx.exec({
    flow: write,
    input: { path: "/workspace/leak/output.txt", content: "blocked" },
  })).rejects.toThrow('path "/outside/output.txt" is outside allowed roots')
  await expect(ctx.exec({
    flow: write,
    input: { path: "/workspace/secret-link", content: "blocked" },
  })).rejects.toThrow('path "/outside/secret.txt" is outside allowed roots')

  await ctx.close()
  await scope.dispose()
})

it("rejects a dangling custom-filesystem symlink before write follows it", async () => {
  const fs = new FollowingFs()
  const physical = new Bash({ cwd: "/workspace", fs })
  const scope = createScope({
    tags: [
      sandbox.policy(sandboxPolicy()),
      config.engine({ create: () => physical }),
      config.workspace({ root: "/workspace" }),
    ],
  })
  const ctx = context(scope, "session-a", sandboxAuthority())

  await expect(fs.exists("/workspace/dangling")).resolves.toBe(false)
  await expect(ctx.exec({
    flow: write,
    input: { path: "/workspace/dangling", content: "blocked" },
  })).rejects.toThrow("dangling symlink")
  await expect(fs.exists("/outside/escaped.txt")).resolves.toBe(false)
  expect(fs.followedWrites).toBe(0)

  await ctx.close()
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
  const sessionA = context(scope, "session-a", authority)
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
    signal: controller.signal,
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
) {
  return scope.createContext({
    tags: [
      session.authority(authority),
      session.record(sessionRecord(id, authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
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

class FollowingFs extends InMemoryFs {
  followedWrites = 0

  constructor() {
    super({ "/workspace/input.txt": "ready" })
  }

  override async exists(path: string): Promise<boolean> {
    return path === "/workspace/dangling" ? false : super.exists(path)
  }

  override async lstat(path: string) {
    if (path !== "/workspace/dangling") return super.lstat(path)
    return {
      isFile: false,
      isDirectory: false,
      isSymbolicLink: true,
      mode: 0o777,
      size: 0,
      mtime: new Date(0),
    }
  }

  override async realpath(path: string): Promise<string> {
    if (path === "/workspace/dangling") throw new Error("ENOENT: dangling symlink")
    return super.realpath(path)
  }

  override async writeFile(
    path: string,
    content: FileContent,
    options?: WriteFileOptions | BufferEncoding,
  ): Promise<void> {
    if (path !== "/workspace/dangling") return super.writeFile(path, content, options)
    this.followedWrites++
    return super.writeFile("/outside/escaped.txt", content, options)
  }
}
