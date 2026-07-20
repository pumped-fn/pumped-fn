import { createScope, flow, preset, typed } from "@pumped-fn/lite"
import { complete, model, type Model, type ModelRequest, type PromptInput } from "@pumped-fn/sdk"
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, expectTypeOf, it } from "vitest"
import * as session from "@pumped-fn/sdk/session"
import * as codexModule from "../src/index"
import {
  codex,
  codexAttempt,
  codexAcp,
  codexAcpAttempt,
  codexAcpConfig,
  codexAcpPrompt,
  codexAcpTurn,
  codexConfig,
  codexRun,
  codexTurn,
  engine,
  type CodexConfig,
} from "../src/index"

const cwd = fileURLToPath(new URL("fixtures", import.meta.url))

const fake = flow({
  name: "codex.fake",
  parse: typed<PromptInput>(),
  factory: (ctx) => JSON.stringify({ content: `provider=codex prompt=${ctx.input.prompt.includes("Agent: review")}`, stop: true }),
})

const fakeAcp = flow({
  name: "codex.acp.fake",
  parse: typed<ModelRequest>(),
  factory: async function* () {
    yield { type: "provider_status" as const, status: "started" }
    return { content: "provider=codex-acp", stop: true }
  },
})

const request: ModelRequest = {
  agentName: "review",
  instructions: "Review.",
  messages: [{ role: "user", content: "check" }],
  tools: [],
  skills: [],
  loadedSkills: [],
  subagents: [],
  round: 0,
}

it("provides Codex through stable module handles", async () => {
  const scope = createScope({
    presets: [preset(codexRun, fake)],
    tags: [codex, codexConfig({ auth: { kind: "global" }, cwd })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=codex prompt=true",
  })
  expectTypeOf(codexTurn).toMatchTypeOf<Model>()

  await ctx.close()
  await scope.dispose()
})

it("normalizes the CLI attempt without changing its scalar response", async () => {
  const scope = createScope({
    presets: [preset(codexRun, fake)],
    tags: [codexConfig({ auth: { kind: "global" }, cwd })],
  })
  const ctx = scope.createContext()
  const stream = ctx.execStream({ flow: codexAttempt, input: {
    agentName: "review",
    instructions: "Review.",
    messages: [],
    tools: [],
    skills: [],
    loadedSkills: [],
    subagents: [],
    round: 0,
  } })
  const normalized = []

  for await (const event of stream) normalized.push(event)

  expect(normalized).toEqual([
    { type: "provider_status", status: "started" },
    { type: "content_delta", content: JSON.stringify({ content: "provider=codex prompt=true", stop: true }) },
    { type: "provider_status", status: "completed" },
  ])
  await expect(stream.result).resolves.toMatchObject({ content: "provider=codex prompt=true" })

  await ctx.close()
  await scope.dispose()
})

it("provides ACP through a preset prompt edge", async () => {
  const scope = createScope({
    presets: [preset(codexAcpAttempt, fakeAcp)],
    tags: [codexModule.provider, codexModule.config({
      auth: { kind: "global" },
      cwd: process.cwd(),
      additionalDirectories: [],
      permission: "deny",
      shutdownTimeoutMs: 5_000,
    })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=codex-acp",
  })

  await ctx.close()
  await scope.dispose()
})

it("runs the CLI from its configured absolute root", async () => {
  const root = await mkdtemp(join(tmpdir(), "pumped-codex-cwd-"))
  const scope = createScope({
    tags: [codexConfig({
      auth: { kind: "global" },
      command: fileURLToPath(new URL("fixtures/print-cwd.mjs", import.meta.url)),
      cwd: root,
    })],
  })
  const ctx = scope.createContext()

  await ctx.exec({ flow: codexRun, input: { prompt: "probe" } })
  await expect(readFile(join(root, "cwd.txt"), "utf8")).resolves.toBe(root)
  expectTypeOf<CodexConfig>().toMatchTypeOf<{ auth: unknown; cwd: string }>()

  await ctx.close()
  await scope.dispose()
  await rm(root, { recursive: true })
})

it("rejects CLI roots and capabilities outside current work authority before starting", async () => {
  const allowed = join(tmpdir(), "pumped-codex-allowed")
  const authority = workAuthority([allowed])
  const cases: Array<{ config: CodexConfig; message: string }> = [
    {
      config: { auth: { kind: "global" }, command: "must-not-start", cwd: process.cwd() },
      message: "Codex roots exceed current work authority",
    },
    {
      config: { auth: { kind: "global" }, command: "must-not-start", cwd: allowed, sandbox: "workspace-write" },
      message: "Codex write exceeds current work authority",
    },
    {
      config: { auth: { kind: "global" }, command: "must-not-start", cwd: allowed, sandbox: "danger-full-access" },
      message: "Codex danger-full-access exceeds current work authority",
    },
    {
      config: { auth: { kind: "global" }, command: "must-not-start", cwd: allowed },
      message: "Codex isolation is required under current work authority",
    },
    {
      config: { auth: { kind: "global" }, command: "must-not-start", cwd: allowed, isolate: { network: true } },
      message: "Codex network exceeds current work authority",
    },
    {
      config: {
        auth: { kind: "global" },
        command: "must-not-start",
        cwd: allowed,
        isolate: { bind: [{ source: process.cwd() }] },
      },
      message: "Codex roots exceed current work authority",
    },
    {
      config: {
        auth: { kind: "global" },
        command: "must-not-start",
        cwd: allowed,
        isolate: { bind: [{ source: "." }] },
      },
      message: "Codex authority roots must be absolute",
    },
  ]

  for (const { config, message } of cases) {
    const scope = createScope({ tags: [codexConfig(config)] })
    const ctx = scope.createContext({ tags: [session.current.authority(authority)] })
    await expect(ctx.exec({ flow: codexRun, input: { prompt: "blocked" } })).rejects.toThrow(message)
    await ctx.close()
    await scope.dispose()
  }
})

it("rejects a relative CLI root before starting its command", async () => {
  const scope = createScope({
    tags: [codexConfig({
      auth: { kind: "global" },
      command: "must-not-start",
      cwd: ".",
    })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: codexRun, input: { prompt: "probe" } })).rejects.toThrow("Codex cwd must be absolute")

  await ctx.close()
  await scope.dispose()
})

it("allowlists harmless CLI extra arguments and rejects authority overrides", async () => {
  const root = await mkdtemp(join(tmpdir(), "pumped-codex-args-"))
  const allowed = createScope({ tags: [codexConfig({
    auth: { kind: "global" },
    command: fileURLToPath(new URL("fixtures/print-cwd.mjs", import.meta.url)),
    cwd: root,
    extraArgs: ["--model=test-model", "--color", "never", "--json", "--skip-git-repo-check"],
  })] })
  const allowedContext = allowed.createContext()
  await expect(allowedContext.exec({ flow: codexRun, input: { prompt: "probe" } })).resolves.toBe("")
  await allowedContext.close()
  await allowed.dispose()

  for (const extraArgs of [
    ["-C", "/"],
    ["--add-dir=/"],
    ["--sandbox", "danger-full-access"],
    ["--dangerously-bypass-approvals-and-sandbox"],
    ["--config=sandbox_mode=\"danger-full-access\""],
    ["--profile", "unsafe"],
    ["--search"],
    ["--image=/etc/passwd"],
  ]) {
    const scope = createScope({ tags: [codexConfig({
      auth: { kind: "global" },
      command: "must-not-start",
      cwd: root,
      extraArgs,
    })] })
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: codexRun, input: { prompt: "blocked" } })).rejects.toThrow("is not allowed")
    await ctx.close()
    await scope.dispose()
  }
  await rm(root, { recursive: true })
})

it("rejects a symlink that escapes the current work root", async () => {
  const root = await mkdtemp(join(tmpdir(), "pumped-codex-symlink-"))
  const allowed = join(root, "allowed")
  const outside = join(root, "outside")
  await mkdir(allowed)
  await mkdir(outside)
  const escape = join(allowed, "escape")
  await symlink(outside, escape, "dir")
  const scope = createScope({ tags: [codexConfig({
    auth: { kind: "global" },
    command: "must-not-start",
    cwd: escape,
  })] })
  const ctx = scope.createContext({ tags: [session.current.authority(workAuthority([allowed]))] })

  await expect(ctx.exec({ flow: codexRun, input: { prompt: "blocked" } })).rejects.toThrow(
    "Codex roots exceed current work authority",
  )

  await ctx.close()
  await scope.dispose()
  await rm(root, { recursive: true })
})

it("binds CLI authority to the current work and passes canonical roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "pumped-codex-bound-root-"))
  const alias = join(root, "alias")
  await symlink(root, alias, "dir")
  const narrow = workAuthority([root])
  const broad = workAuthority([root, process.cwd()])
  const work: session.WorkRecord = {
    id: "work-1",
    branchId: "main",
    role: "task",
    status: "working",
    policy: "all",
    attempt: 1,
    authority: narrow,
  }
  const scope = createScope({
    tags: [codexConfig({
      auth: { kind: "global" },
      command: fileURLToPath(new URL("fixtures/print-cwd.mjs", import.meta.url)),
      cwd: alias,
    })],
  })
  const ctx = scope.createContext({ tags: [session.current.authority(broad), session.current.work(work)] })

  await expect(ctx.exec({ flow: codexRun, input: { prompt: "blocked" } })).rejects.toThrow(
    "Codex authority does not match current work",
  )
  await ctx.close()
  await scope.dispose()

  const allowed = createScope({
    tags: [codexConfig({
      auth: { kind: "global" },
      command: fileURLToPath(new URL("fixtures/print-cwd.mjs", import.meta.url)),
      cwd: alias,
    })],
  })
  const allowedContext = allowed.createContext()
  await allowedContext.exec({ flow: codexRun, input: { prompt: "canonical" } })
  await expect(readFile(join(root, "cwd.txt"), "utf8")).resolves.toBe(root)
  await allowedContext.close()
  await allowed.dispose()
  await rm(root, { recursive: true })
})

it("binds the ACP resource before spawning its child", async () => {
  const root = await mkdtemp(join(tmpdir(), "pumped-codex-acp-bound-root-"))
  const narrow = workAuthority([root])
  const broad = workAuthority([root, process.cwd()])
  const work: session.WorkRecord = {
    id: "work-1",
    branchId: "main",
    role: "task",
    status: "working",
    policy: "all",
    attempt: 1,
    authority: narrow,
  }
  const scope = createScope({
    tags: [codexAcpConfig({
      auth: { kind: "global" },
      command: "must-not-start",
      cwd: root,
      additionalDirectories: [],
      permission: "deny",
      shutdownTimeoutMs: 100,
    })],
  })
  const ctx = scope.createContext({ tags: [session.current.authority(broad), session.current.work(work)] })

  await expect(ctx.resolve(engine)).rejects.toThrow("Codex authority does not match current work")
  await ctx.close()
  await scope.dispose()
  await rm(root, { recursive: true })
})

it("exports the managed ACP path as module namespace handles", () => {
  expect(codexModule.config).toBe(codexAcpConfig)
  expect(codexModule.engine).toBe(engine)
  expect(codexModule.run).toBe(codexAcpPrompt)
  expect(codexModule.turn).toBe(codexAcpTurn)
  expect(codexModule.provider).toBe(codexAcp)
  expectTypeOf(codexModule.turn).toMatchTypeOf<Model>()
})

it("declares the public model through the provider turn, prompt, and boundary", () => {
  expect(complete.deps?.["impl"]).toMatchObject({ tag: model, mode: "required" })
  expect(codexTurn.deps?.["attempt"]).toMatchObject({ flow: codexAttempt })
  expect(codexAcp.tag).toBe(model)
  expect(codexAcp.value).toBe(codexAcpTurn)
  expect(codexAcpTurn.deps?.["attempt"]).toMatchObject({ flow: codexAcpAttempt })
  expect(codexAcpPrompt.deps?.["acp"]).toBe(codexModule.acp)
})

it("can replace the model tag per context", async () => {
  const replacement: Model = flow({
    parse: typed<ModelRequest>(),
    factory: () => ({ content: "provider=fake", stop: true }),
  })
  const scope = createScope({
    presets: [preset(codexRun, fake)],
    tags: [codex, codexConfig({ auth: { kind: "global" }, cwd })],
  })
  const codexCtx = scope.createContext()
  const fakeCtx = scope.createContext({ tags: [model(replacement)] })

  await expect(codexCtx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=codex prompt=true",
  })
  await expect(fakeCtx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=fake",
  })

  await codexCtx.close()
  await fakeCtx.close()
  await scope.dispose()
})

function workAuthority(roots: readonly string[], write = false, network = false): session.Authority {
  return session.createAuthority({
    tenant: "codex-test",
    roots,
    permissions: [],
    tools: [],
    sandbox: { roots, commands: [], write, network },
  })
}
