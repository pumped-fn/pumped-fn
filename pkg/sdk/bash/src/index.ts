import { Buffer } from "node:buffer"
import { posix } from "node:path"
import { Bash } from "just-bash"
import { abortSignal } from "@pumped-fn/sdk"
import * as sandbox from "@pumped-fn/sdk/sandbox"
import * as session from "@pumped-fn/sdk/session"
import { atom, flow, resource, tag, tags, typed } from "@pumped-fn/lite"

export type BashOptions = ConstructorParameters<typeof Bash>[0]

export interface EngineConfig {
  readonly create?: (options: BashOptions) => Bash
  readonly options?: BashOptions
}

export interface WorkspaceConfig {
  readonly root: string
}

export interface SandboxAuthority {
  readonly fingerprint: string
  readonly policy: sandbox.Policy
}

export interface Workspace {
  readonly root: string
  readonly bash: Bash
}

export interface Readiness {
  readonly authorityFingerprint: string
  readonly root: string
}

export class OutputLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Sandbox output exceeds ${limit} bytes`)
    this.name = "OutputLimitError"
  }
}

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkspaceError"
  }
}

export const config = Object.freeze({
  engine: tag<EngineConfig>({ label: "just-bash.config.engine" }),
  workspace: tag<WorkspaceConfig>({ label: "just-bash.config.workspace" }),
})

export const clock = atom({
  factory: () => ({
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  }),
})

export const authority = resource({
  name: "just-bash.authority",
  ownership: "current",
  deps: {
    runtime: session.session,
    policy: tags.required(sandbox.policy),
  },
  factory: (_ctx, { runtime, policy }) => {
    assertAuthority(runtime.authority, policy)
    return Object.freeze({ fingerprint: runtime.authority.fingerprint, policy })
  },
})

export const engine = resource({
  name: "just-bash.engine",
  ownership: "current",
  deps: {
    authority,
    engine: tags.required(config.engine),
    workspace: tags.required(config.workspace),
  },
  factory: (_ctx, deps) => {
    const options = deps.engine.options ?? {}
    const executionLimits = {
      ...options.executionLimits,
      maxOutputSize: Math.min(
        options.executionLimits?.maxOutputSize ?? deps.authority.policy.maxOutputBytes,
        deps.authority.policy.maxOutputBytes,
      ),
    }
    return (deps.engine.create ?? ((value) => new Bash(value)))({
      ...options,
      cwd: deps.workspace.root,
      executionLimits,
      fetch: deps.authority.policy.network ? options.fetch : undefined,
      network: deps.authority.policy.network ? options.network : undefined,
    })
  },
})

export const workspace = resource({
  name: "just-bash.workspace",
  ownership: "current",
  deps: {
    authority,
    engine,
    config: tags.required(config.workspace),
  },
  factory: (_ctx, deps) => {
    if (!deps.config.root.startsWith("/")) throw new WorkspaceError("Sandbox workspace root must be absolute")
    const root = posix.normalize(deps.config.root)
    if (!deps.authority.policy.roots.some((allowed) => within(root, posix.normalize(allowed)))) {
      throw new WorkspaceError("Sandbox workspace root is outside allowed roots")
    }
    return Object.freeze({ root, bash: deps.engine })
  },
})

export const readiness = resource({
  name: "just-bash.readiness",
  ownership: "current",
  deps: { authority, workspace },
  factory: (_ctx, deps) => Object.freeze({
    authorityFingerprint: deps.authority.fingerprint,
    root: deps.workspace.root,
  }),
})

export const read: sandbox.Read = flow({
  name: "just-bash.read",
  parse: typed<sandbox.ReadInput>(),
  deps: { readiness, workspace },
  factory: (ctx, { workspace }) => workspace.bash.readFile(ctx.input.path),
})

export const write: sandbox.Write = flow({
  name: "just-bash.write",
  parse: typed<sandbox.WriteInput>(),
  deps: { readiness, workspace },
  factory: (ctx, { workspace }) => workspace.bash.writeFile(ctx.input.path, ctx.input.content),
})

export const run: sandbox.Run = flow({
  name: "just-bash.run",
  parse: typed<sandbox.ExecInput>(),
  deps: {
    clock,
    policy: tags.required(sandbox.policy),
    readiness,
    signal: tags.optional(abortSignal),
    workspace,
  },
  factory: async function* (ctx, deps): AsyncGenerator<sandbox.ExecEvent, sandbox.ExecResult, unknown> {
    deps.signal?.throwIfAborted()
    const controller = new AbortController()
    const abort = () => controller.abort(deps.signal?.reason)
    deps.signal?.addEventListener("abort", abort, { once: true })
    const unregister = ctx.onClose(() => controller.abort(new DOMException("Sandbox stream closed", "AbortError")))
    let timedOut = false
    const timer = deps.clock.set(() => {
      timedOut = true
      controller.abort(new Error(`Sandbox command timed out after ${deps.policy.timeoutMs}ms`))
    }, deps.policy.timeoutMs)
    let result: Awaited<ReturnType<Bash["exec"]>>
    try {
      result = await deps.workspace.bash.exec(
        [ctx.input.command, ...(ctx.input.args ?? [])].map(quote).join(" "),
        { signal: controller.signal },
      )
      if (timedOut) throw controller.signal.reason
      deps.signal?.throwIfAborted()
    } finally {
      deps.clock.clear(timer)
      deps.signal?.removeEventListener("abort", abort)
      unregister()
    }
    if (Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > deps.policy.maxOutputBytes) {
      throw new OutputLimitError(deps.policy.maxOutputBytes)
    }
    if (result.stdout) yield { type: "stdout", content: result.stdout }
    if (result.stderr) yield { type: "stderr", content: result.stderr }
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
  },
})

export const binding = Object.freeze({
  read: sandbox.impl.read(read),
  write: sandbox.impl.write(write),
  run: sandbox.impl.run(run),
})

function assertAuthority(value: session.Authority, policy: sandbox.Policy): void {
  if (policy.write && !value.sandbox.write) throw new sandbox.PolicyError("write exceeds session authority")
  if (policy.network && !value.sandbox.network) throw new sandbox.PolicyError("network exceeds session authority")
  if (!policy.roots.every((root) => value.sandbox.roots.includes(root))) {
    throw new sandbox.PolicyError("roots exceed session authority")
  }
  if (!policy.commands.every((command) => value.sandbox.commands.includes(command))) {
    throw new sandbox.PolicyError("commands exceed session authority")
  }
}

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith("/") ? root : `${root}/`)
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
