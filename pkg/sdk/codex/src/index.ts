import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, resolve } from "node:path"
import {
  PROTOCOL_VERSION,
  client,
  ndJsonStream,
  type ActiveSession,
  type ClientContext,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk"
import { atom, controller, flow, resource, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import {
  formatModelPrompt,
  model,
  parseModelResponse,
  runCli,
  step,
  type CliIsolateOptions,
  type ModelRequest,
  type PromptInput,
} from "@pumped-fn/sdk"
import { absolutePath, spawnProcess, webStreams } from "./adapters/process"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"

export type CodexAuth =
  | { kind: "api-key"; env?: string }
  | { kind: "global" }

/** Configures Codex authentication, working directory, sandboxing, isolation, arguments, and timeout. */
export interface CodexConfig {
  auth: CodexAuth
  command?: string
  cwd: string
  sandbox?: "read-only" | "workspace-write" | "danger-full-access"
  extraArgs?: readonly string[]
  isolate?: boolean | CliIsolateOptions
  timeoutMs?: number
}

export class CodexConfigError extends Error {
  override readonly name = "CodexConfigError"
}

export class CodexShutdownError extends Error {
  override readonly name = "CodexShutdownError"
}

export class CodexConcurrencyError extends Error {
  override readonly name = "CodexConcurrencyError"
}

export const codexConfig = tag<CodexConfig>({ label: "codex.config" })

export const environment = atom({
  factory: () => process.env,
})

export const clock = atom({
  factory: () => ({
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  }),
})

export const codexRun = flow({
  name: "codex.run",
  parse: typed<PromptInput>(),
  deps: {
    absolutePath,
    authority: tags.optional(session.current.authority),
    config: tags.required(codexConfig),
    environment,
    work: tags.optional(session.current.work),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { absolutePath, authority, config, environment, work }) => {
    if (!absolutePath(config.cwd)) throw new CodexConfigError("Codex cwd must be absolute")
    assertExtraArgs(config.extraArgs ?? [])
    const boundAuthority = bindAuthority(authority, work)
    const effectiveConfig = boundAuthority ? authorizeCliConfig(config, boundAuthority) : config
    const env = config.auth.kind === "api-key"
      ? { CODEX_API_KEY: requiredEnvironment(environment, config.auth.env ?? "CODEX_API_KEY") }
      : undefined
    return (await runCli({
      command: config.command ?? "codex",
      args: [
        "exec",
        "-s",
        config.sandbox ?? "read-only",
        "--ephemeral",
        "--ignore-user-config",
        ...(config.extraArgs ?? []),
        "--",
        ctx.input.prompt,
      ],
      cwd: effectiveConfig.cwd,
      env,
      isolate: effectiveConfig.isolate,
      timeoutMs: effectiveConfig.timeoutMs,
      signal: ctx.signal,
    })).stdout.trim()
  },
})

export const codexAttempt: agent.Attempt = flow({
  name: "codex.attempt",
  parse: typed<ModelRequest>(),
  deps: { run: controller(codexRun) },
  factory: async function* (ctx, { run }) {
    yield { type: "provider_status", status: "started" }
    const output = await run.exec({ input: { prompt: formatModelPrompt(ctx.input) } })
    yield { type: "content_delta", content: output }
    yield { type: "provider_status", status: "completed" }
    return parseModelResponse(output)
  },
})

export const codexAttemptBinding = agent.impl.attempt(codexAttempt)

export const codexTurn = flow({
  name: "codex.complete",
  parse: typed<ModelRequest>(),
  deps: { attempt: controller(codexAttempt) },
  factory: (ctx, { attempt }) => attempt.exec({ input: ctx.input }),
})

export const codex = model(codexTurn)

/** Configures a persistent Codex ACP process, roots, permissions, and shutdown bound. */
export interface CodexAcpConfig {
  auth: CodexAuth
  command?: string
  args?: readonly string[]
  cwd: string
  additionalDirectories: readonly string[]
  permission: "grant" | "deny"
  shutdownTimeoutMs: number
}

export const codexAcpConfig = tag<CodexAcpConfig>({ label: "codex.acp.config" })

export const acp = resource({
  name: "codex.acp",
  ownership: "boundary",
  deps: {
    clock,
    config: tags.required(codexAcpConfig),
    environment,
    absolutePath,
    authority: tags.optional(session.current.authority),
    spawn: spawnProcess,
    streams: webStreams,
    work: tags.optional(session.current.work),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { absolutePath, authority, clock, config, environment, spawn, streams, work }) => {
    const boundAuthority = bindAuthority(authority, work)
    const effectiveConfig = boundAuthority ? authorizeAcpConfig(config, boundAuthority) : config
    if (!effectiveConfig.auth) throw new CodexConfigError("ACP auth must be explicitly set")
    if (!absolutePath(effectiveConfig.cwd)) throw new CodexConfigError("ACP cwd must be absolute")
    if (effectiveConfig.additionalDirectories.some((directory) => !absolutePath(directory))) {
      throw new CodexConfigError("ACP additionalDirectories must be absolute")
    }
    if (!Number.isFinite(effectiveConfig.shutdownTimeoutMs) || effectiveConfig.shutdownTimeoutMs <= 0) {
      throw new CodexConfigError("ACP shutdownTimeoutMs must be greater than zero")
    }
    const sessions = new Map<string, string[]>()
    const eventStreams = new Map<string, EventQueue<agent.ModelEvent>>()
    const continuations = new Map<string, string | Promise<string>>()
    const authorities = new Map<string, session.Authority>()
    const metadata = new Map<string, { agentName: string; round: number }>()
    const child = spawn(effectiveConfig.command ?? "codex-acp", [...(effectiveConfig.args ?? [])], {
      cwd: effectiveConfig.cwd,
      env: effectiveConfig.auth.kind === "api-key"
        ? Object.assign({}, environment, { CODEX_API_KEY: requiredEnvironment(environment, effectiveConfig.auth.env ?? "CODEX_API_KEY") })
        : environment,
      stdio: ["pipe", "pipe", "pipe"],
    })
    if (!child.stdin || !child.stdout || !child.stderr) throw new CodexConfigError("ACP adapter requires piped stdio")
    child.stderr.resume()
    let childFailure: unknown
    const childClosed = child.exitCode === null
      ? new Promise<void>((resolve) => {
          child.once("error", (error) => {
            childFailure = error
            resolve()
          })
          child.once("close", () => resolve())
        })
      : Promise.resolve()
    const app = client({ name: "pumped-fn" })
      .onNotification("session/update", async ({ params: notification }: { params: SessionNotification }) => {
        const session = sessions.get(notification.sessionId)
        if (
          session
          && notification.update.sessionUpdate === "agent_message_chunk"
          && notification.update.content.type === "text"
        ) {
          session.push(notification.update.content.text)
          eventStreams.get(notification.sessionId)?.push({
            type: "content_delta",
            content: notification.update.content.text,
          })
        }
      })
      .onRequest("session/request_permission", async ({ params: request }: { params: RequestPermissionRequest }): Promise<RequestPermissionResponse> => {
        const authority = authorities.get(request.sessionId)
        const granted = request.options.find((option) => option.kind === "allow_once")
        if (effectiveConfig.permission === "grant" && authority && granted && permissionAllowed(request, authority)) {
          eventStreams.get(request.sessionId)?.push({ type: "provider_status", status: "permission:selected" })
          return { outcome: { outcome: "selected", optionId: granted.optionId } }
        }
        eventStreams.get(request.sessionId)?.push({ type: "provider_status", status: "permission:cancelled" })
        return { outcome: { outcome: "cancelled" } }
      })
    const connection = app.connect(
      ndJsonStream(
        streams.writable(child.stdin) as WritableStream<Uint8Array>,
        streams.readable(child.stdout) as ReadableStream<Uint8Array>,
      ),
    )
    let closing: Promise<void> | undefined
    const close = () => closing ??= (async () => {
      sessions.clear()
      eventStreams.clear()
      continuations.clear()
      authorities.clear()
      metadata.clear()
      let connectionFailure: unknown
      const transportClosed = connection.closed.catch((error) => {
        connectionFailure = error
      })
      const settled = Promise.all([transportClosed, childClosed])
      const within = async () => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<false>((resolve) => {
          timer = clock.set(() => resolve(false), effectiveConfig.shutdownTimeoutMs)
        })
        const result = await Promise.race([settled.then(() => true as const), timeout])
        if (timer) clock.clear(timer)
        return result
      }
      try {
        connection.close()
      } catch (error) {
        connectionFailure = error
      }
      if (child.exitCode === null) {
        try {
          child.kill("SIGTERM")
        } catch (error) {
          childFailure = error
        }
      }
      if (!await within()) {
        if (child.exitCode === null) {
          try {
            child.kill("SIGKILL")
          } catch (error) {
            childFailure = error
          }
        }
        if (!await within()) {
          throw new CodexShutdownError(`Codex ACP did not close within ${effectiveConfig.shutdownTimeoutMs * 2}ms`)
        }
      }
      if (connectionFailure || childFailure) {
        throw new CodexShutdownError("Codex ACP closed with a lifecycle failure", { cause: connectionFailure ?? childFailure })
      }
    })()
    ctx.cleanup((target) => target(), close)
    await connection.agent.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    })
    return { authorities, connection, sessions, streams: eventStreams, continuations, metadata, terminate: close }
  },
})

const acpResource = acp

export const codexAcpPrompt = flow({
  name: "codex.acp.prompt",
  parse: typed<ModelRequest>(),
  deps: {
    acp,
    attempt: tags.optional(session.current.attempt),
    authority: tags.optional(session.current.authority),
    clock,
    config: tags.required(codexAcpConfig),
    runtime: tags.optional(session.current.session),
    work: tags.optional(session.current.work),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { acp, attempt, authority, clock, config, runtime, work }) => {
    const signal = ctx.signal
    signal.throwIfAborted()
    const boundAuthority = bindSessionAuthority(runtime, work, attempt, authority)
    const effectiveConfig = boundAuthority ? authorizeAcpConfig(config, boundAuthority) : config
    const sessionId = await createAcpSession(acp.connection.agent, effectiveConfig, signal)
    const remote = startRemoteInvocation(runtime, work, attempt, sessionId)
    const chunks: string[] = []
    if (boundAuthority) acp.authorities.set(sessionId, boundAuthority)
    acp.sessions.set(sessionId, chunks)
    acp.metadata.set(sessionId, { agentName: ctx.input.agentName, round: ctx.input.round })
    let cancellation: Promise<void> | undefined
    const cancel = () => {
      cancellation ??= acp.connection.agent.notify("session/cancel", { sessionId })
    }
    signal.addEventListener("abort", cancel, { once: true })
    if (signal.aborted) cancel()
    const prompt = acp.connection.agent.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: formatModelPrompt(ctx.input) }],
    })
    let completed = false
    try {
      await abortable(prompt, signal)
      completed = true
    } finally {
      signal.removeEventListener("abort", cancel)
      if (signal.aborted) cancel()
      acp.sessions.delete(sessionId)
      acp.authorities.delete(sessionId)
      acp.metadata.delete(sessionId)
      if (signal.aborted) {
        const stopped = await bounded(Promise.allSettled([
          prompt,
          ...(cancellation ? [cancellation] : []),
        ]), clock, effectiveConfig.shutdownTimeoutMs)
        if (!stopped) {
          try {
            await acp.terminate()
            for (let current: Lite.ExecutionContext | undefined = ctx; current; current = current.parent) {
              await current.release(acpResource)
            }
          } catch (error) {
            settleRemoteInvocation(runtime, remote, "quarantined")
            throw error
          }
        }
      }
      settleRemoteInvocation(runtime, remote, completed ? "completed" : signal.aborted ? "cancelled" : "failed")
    }
    signal.throwIfAborted()
    return chunks.join("")
  },
})

export const codexAcpAttempt: agent.Attempt = flow({
  name: "codex.acp.attempt",
  parse: typed<ModelRequest>(),
  deps: {
    acp,
    attempt: tags.optional(session.current.attempt),
    authority: tags.optional(session.current.authority),
    clock,
    config: tags.required(codexAcpConfig),
    record: tags.optional(session.record),
    branch: tags.optional(session.current.branch),
    runtime: tags.optional(session.current.session),
    work: tags.optional(session.current.work),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async function* (ctx, { acp, attempt, authority, branch, clock, config, record, runtime, work }) {
    const signal = ctx.signal
    signal.throwIfAborted()
    const boundAuthority = bindSessionAuthority(runtime, work, attempt, authority)
    const effectiveConfig = boundAuthority ? authorizeAcpConfig(config, boundAuthority) : config
    const authorityFingerprint = boundAuthority?.fingerprint ?? branch?.authorityFingerprint ?? record?.authorityFingerprint
    const continuationKey = record && branch && authorityFingerprint
      ? `codex-acp:${record.id}:${branch.id}:${authorityFingerprint}`
      : undefined
    const createSession = () => createAcpSession(acp.connection.agent, effectiveConfig, signal)
    let sessionId: string
    if (continuationKey) {
      let continuation: string | Promise<string> | undefined = runtime?.continuations.get(continuationKey)
        ?? acp.continuations.get(continuationKey)
      if (typeof continuation === "string" && !acp.continuations.has(continuationKey)) {
        acp.continuations.set(continuationKey, continuation)
      }
      if (!continuation) {
        let reservation: Promise<string>
        reservation = createSession().then((created) => {
          if (acp.continuations.get(continuationKey) === reservation) {
            if (runtime && runtime.status !== "open") {
              acp.continuations.delete(continuationKey)
            } else {
              acp.continuations.set(continuationKey, created)
              runtime?.continuations.set(continuationKey, created)
            }
          }
          return created
        }, (error) => {
          if (acp.continuations.get(continuationKey) === reservation) {
            acp.continuations.delete(continuationKey)
          }
          throw error
        })
        acp.continuations.set(continuationKey, reservation)
        continuation = reservation
      }
      sessionId = typeof continuation === "string"
        ? continuation
        : await abortable(continuation, signal)
    } else {
      sessionId = await abortable(createSession(), signal)
    }
    signal.throwIfAborted()
    if (acp.sessions.has(sessionId)) {
      throw new CodexConcurrencyError(`ACP session ${sessionId} already has an active prompt`)
    }
    const remote = startRemoteInvocation(runtime, work, attempt, sessionId)
    const chunks: string[] = []
    const stream = new EventQueue<agent.ModelEvent>()
    const metadata = { agentName: ctx.input.agentName, round: ctx.input.round }
    acp.sessions.set(sessionId, chunks)
    acp.streams.set(sessionId, stream)
    if (boundAuthority) acp.authorities.set(sessionId, boundAuthority)
    acp.metadata.set(sessionId, metadata)
    let cancellation: Promise<void> | undefined
    let promptStatus: "completed" | "failed" | undefined
    const cancel = () => {
      cancellation ??= acp.connection.agent.notify("session/cancel", { sessionId })
      stream.fail(signal.reason ?? new DOMException("Codex ACP stream closed", "AbortError"))
    }
    signal.addEventListener("abort", cancel, { once: true })
    if (signal.aborted) cancel()
    const prompt = acp.connection.agent.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: formatModelPrompt(ctx.input) }],
    }).then(() => {
      promptStatus = "completed"
      stream.push({ type: "provider_status", status: "completed" })
      stream.end()
    }, (error) => {
      promptStatus = "failed"
      stream.fail(error)
    })
    stream.push({ type: "provider_status", status: "started" })
    try {
      for await (const event of stream) yield event
      await prompt
      return parseModelResponse(chunks.join(""))
    } finally {
      signal.removeEventListener("abort", cancel)
      if (!promptStatus) cancel()
      const release = () => {
        if (acp.sessions.get(sessionId) === chunks) acp.sessions.delete(sessionId)
        if (acp.streams.get(sessionId) === stream) acp.streams.delete(sessionId)
        if (boundAuthority && acp.authorities.get(sessionId) === boundAuthority) acp.authorities.delete(sessionId)
        if (acp.metadata.get(sessionId) === metadata) acp.metadata.delete(sessionId)
      }
      const completion = Promise.allSettled([
        ...(cancellation ? [cancellation] : []),
        prompt,
      ])
      const stopped = await bounded(completion, clock, effectiveConfig.shutdownTimeoutMs)
      if (stopped) {
        release()
        settleRemoteInvocation(runtime, remote, signal.aborted ? "cancelled" : promptStatus ?? "failed")
      } else {
        try {
          await acp.terminate()
          for (let current: Lite.ExecutionContext | undefined = ctx; current; current = current.parent) {
            await current.release(acpResource)
          }
          release()
          if (continuationKey && runtime?.continuations.get(continuationKey) === sessionId) {
            runtime.continuations.delete(continuationKey)
          }
          if (continuationKey && acp.continuations.get(continuationKey) === sessionId) {
            acp.continuations.delete(continuationKey)
          }
          settleRemoteInvocation(runtime, remote, "cancelled")
        } catch (error) {
          settleRemoteInvocation(runtime, remote, "quarantined")
          throw error
        }
      }
    }
  },
})

export const codexAcpAttemptBinding = agent.impl.attempt(codexAcpAttempt)

export const codexAcpTurn = flow({
  name: "codex.acp.complete",
  parse: typed<ModelRequest>(),
  deps: { attempt: controller(codexAcpAttempt) },
  factory: (ctx, { attempt }) => attempt.exec({ input: ctx.input }),
})

export const codexAcp = model(codexAcpTurn)

export {
  codexAcpConfig as config,
  acp as engine,
  codexAcpPrompt as run,
  codexAcpTurn as turn,
  codexAcp as provider,
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]
  if (!value) throw new CodexConfigError(`Codex API key environment variable "${name}" is not set`)
  return value
}

function assertExtraArgs(args: readonly string[]): void {
  const values = new Set(["-m", "--model", "--color"])
  const switches = new Set(["--json", "--skip-git-repo-check"])
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!
    const equals = argument.indexOf("=")
    const option = equals === -1 ? argument : argument.slice(0, equals)
    if (switches.has(option) && equals === -1) continue
    if (!values.has(option)) throw new CodexConfigError(`Codex extra argument ${argument} is not allowed`)
    if (equals !== -1) {
      if (argument.length === equals + 1) throw new CodexConfigError(`Codex extra argument ${option} requires a value`)
      continue
    }
    const value = args[++index]
    if (value === undefined || value.startsWith("-")) throw new CodexConfigError(`Codex extra argument ${option} requires a value`)
  }
}

function bindAuthority(
  authority: session.Authority | undefined,
  work: session.WorkRecord | undefined,
): session.Authority | undefined {
  if (authority && session.authorityFingerprint(authority) !== authority.fingerprint) {
    throw new CodexConfigError("Codex authority fingerprint is invalid")
  }
  if (work && session.authorityFingerprint(work.authority) !== work.authority.fingerprint) {
    throw new CodexConfigError("Codex work authority fingerprint is invalid")
  }
  if (!work) return authority
  if (!authority || authority.fingerprint !== work.authority.fingerprint) {
    throw new CodexConfigError("Codex authority does not match current work")
  }
  return work.authority
}

function bindSessionAuthority(
  runtime: session.SessionRuntime | undefined,
  work: session.WorkRecord | undefined,
  attempt: session.AttemptRecord | undefined,
  authority: session.Authority | undefined,
): session.Authority | undefined {
  if (
    (work && (!runtime || !attempt || !authority))
    || (attempt && (!runtime || !work || !authority))
  ) {
    throw new CodexConfigError("Codex session tags must be provided as one bound tuple")
  }
  if (!work) return authority
  if (!runtime || !attempt) throw new CodexConfigError("Codex session tags must be provided as one bound tuple")
  return bindAuthority(authority, work)
}

function authorizeCliConfig(config: CodexConfig, authority: session.Authority): CodexConfig {
  assertCliAuthority(config, authority)
  const isolate = typeof config.isolate === "object" ? config.isolate : undefined
  return {
    ...config,
    cwd: canonicalPath(config.cwd),
    isolate: isolate ? {
      ...isolate,
      ...(isolate.home ? { home: canonicalPath(isolate.home) } : {}),
      ...(isolate.codexHome ? { codexHome: canonicalPath(isolate.codexHome) } : {}),
      ...(isolate.bind ? { bind: isolate.bind.map((bind) => ({ ...bind, source: canonicalPath(bind.source) })) } : {}),
    } : config.isolate,
  }
}

function authorizeAcpConfig(config: CodexAcpConfig, authority: session.Authority): CodexAcpConfig {
  assertAcpAuthority(config, authority)
  return {
    ...config,
    cwd: canonicalPath(config.cwd),
    additionalDirectories: config.additionalDirectories.map(canonicalPath),
  }
}

function startRemoteInvocation(
  runtime: session.SessionRuntime | undefined,
  work: session.WorkRecord | undefined,
  attempt: session.AttemptRecord | undefined,
  sessionId: string,
): string | undefined {
  if (!runtime || !work || !attempt) return undefined
  const id = `codex-acp:${work.id}:${attempt.attempt}:${sessionId}`
  runtime.invocations.start({
    id,
    workId: work.id,
    attempt: attempt.attempt,
    kind: "adapter",
    idempotencyKey: id,
  })
  return id
}

function settleRemoteInvocation(
  runtime: session.SessionRuntime | undefined,
  id: string | undefined,
  status: "completed" | "failed" | "cancelled" | "quarantined",
): void {
  if (runtime && id) runtime.invocations.settle(id, status)
}

function assertCliAuthority(config: CodexConfig, authority: session.Authority): void {
  const isolate = typeof config.isolate === "object" ? config.isolate : undefined
  const roots = [
    config.cwd,
    ...(isolate?.home ? [isolate.home] : []),
    ...(isolate?.codexHome ? [isolate.codexHome] : []),
    ...(isolate?.bind?.map((bind) => bind.source) ?? []),
  ]
  if (roots.some((root) => !isAbsolute(root))) throw new CodexConfigError("Codex authority roots must be absolute")
  assertRoots("Codex", roots, authority)
  const sandbox = config.sandbox ?? "read-only"
  if (sandbox === "danger-full-access") {
    throw new CodexConfigError("Codex danger-full-access exceeds current work authority")
  }
  const write = sandbox !== "read-only"
    || isolate?.writable === true
    || isolate?.home !== undefined
    || isolate?.codexHome !== undefined
    || isolate?.bind?.some((bind) => bind.mode === "rw") === true
  if (write && !authority.sandbox.write) throw new CodexConfigError("Codex write exceeds current work authority")
  if ((sandbox === "danger-full-access" || isolate?.network === true) && !authority.sandbox.network) {
    throw new CodexConfigError("Codex network exceeds current work authority")
  }
  if (!config.isolate) throw new CodexConfigError("Codex isolation is required under current work authority")
}

function assertAcpAuthority(config: CodexAcpConfig, authority: session.Authority): void {
  assertRoots("ACP", [config.cwd, ...config.additionalDirectories], authority)
  if (config.permission === "grant" && !authority.sandbox.write) {
    throw new CodexConfigError("ACP write exceeds current work authority")
  }
  if (config.permission === "grant" && !authority.sandbox.network) {
    throw new CodexConfigError("ACP network exceeds current work authority")
  }
}

function permissionAllowed(request: RequestPermissionRequest, authority: session.Authority): boolean {
  const title = request.toolCall.title ?? ""
  const kind = request.toolCall.kind ?? ""
  return authority.permissions.includes(title)
    || authority.permissions.includes(kind)
    || authority.tools.includes(title)
    || authority.tools.includes(kind)
}

function assertRoots(provider: "Codex" | "ACP", roots: readonly string[], authority: session.Authority): void {
  const allowedRoots = authority.sandbox.roots.map(canonicalPath)
  if (roots.map(canonicalPath).some((root) => !allowedRoots.some((allowed) => within(root, allowed)))) {
    throw new CodexConfigError(`${provider} roots exceed current work authority`)
  }
}

function within(path: string, root: string): boolean {
  return root === "/" || path === root || path.startsWith(`${root}/`)
}

function canonicalPath(path: string): string {
  let current = resolve(path)
  const remainder: string[] = []
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) throw new CodexConfigError(`Codex root ${path} cannot be resolved`)
    remainder.unshift(basename(current))
    current = parent
  }
  return resolve(realpathSync(current), ...remainder)
}

async function createAcpSession(
  agent: ClientContext,
  config: CodexAcpConfig,
  signal?: AbortSignal,
): Promise<string> {
  const pending = agent.buildSession({
    cwd: config.cwd,
    additionalDirectories: [...config.additionalDirectories],
    mcpServers: [],
  }).start()
  let active: ActiveSession
  try {
    active = await abortable(pending, signal)
  } catch (error) {
    void pending.then((session) => session.dispose(), () => undefined)
    throw error
  }
  const sessionId = active.sessionId
  active.dispose()
  return sessionId
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    promise.then((value) => {
      signal.removeEventListener("abort", abort)
      resolve(value)
    }, (error) => {
      signal.removeEventListener("abort", abort)
      reject(error)
    })
  })
}

async function bounded(
  promise: Promise<unknown>,
  scheduler: {
    set(fn: () => void, ms: number): ReturnType<typeof setTimeout>
    clear(timer: ReturnType<typeof setTimeout>): void
  },
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const settled = await Promise.race([
    promise.then(() => true),
    new Promise<false>((resolve) => {
      timer = scheduler.set(() => resolve(false), timeoutMs)
    }),
  ])
  if (timer) scheduler.clear(timer)
  return settled
}

class EventQueue<T> implements AsyncIterable<T> {
  private values: T[] = []
  private waiters: Array<(result: IteratorResult<T>) => void> = []
  private failure: unknown
  private closed = false

  push(value: T): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ done: false, value })
    else this.values.push(value)
  }

  end(): void {
    if (this.closed) return
    this.closed = true
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined })
  }

  fail(error: unknown): void {
    this.failure = error
    this.end()
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, unknown> {
    while (true) {
      const result = await this.next()
      if (result.done) {
        if (this.failure) throw this.failure
        return
      }
      yield result.value
    }
  }

  private next(): Promise<IteratorResult<T>> {
    const value = this.values.shift()
    if (value !== undefined) return Promise.resolve({ done: false, value })
    if (this.closed) return Promise.resolve({ done: true, value: undefined })
    return new Promise((resolve) => this.waiters.push(resolve))
  }
}
