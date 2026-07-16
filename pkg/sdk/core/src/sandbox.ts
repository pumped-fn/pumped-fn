import { flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import * as session from "./session.js"

/** Defines the roots, effects, commands, and resource limits enforced by a sandbox. */
export interface Policy {
  readonly roots: readonly string[]
  readonly write: boolean
  readonly network: boolean
  readonly commands: readonly string[]
  readonly timeoutMs: number
  readonly maxOutputBytes: number
}

/** Identifies an absolute sandbox path to read. */
export interface ReadInput {
  readonly path: string
}

/** Supplies content and an absolute sandbox path to write. */
export interface WriteInput {
  readonly path: string
  readonly content: string
}

/** Selects an allowed sandbox command and its arguments. */
export interface ExecInput {
  readonly command: string
  readonly args?: readonly string[]
}

/** Captures the output streams and exit status of a sandbox command. */
export interface ExecResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export type ExecEvent =
  | { readonly type: "stdout"; readonly content: string }
  | { readonly type: "stderr"; readonly content: string }

export type Read = Lite.Flow<string, ReadInput>
export type Write = Lite.Flow<void, WriteInput>
export type Run = Lite.Flow<ExecResult, ExecInput, never, ExecEvent>

export class PolicyError extends Error {
  constructor(readonly reason: string) {
    super(`Sandbox policy denied: ${reason}`)
    this.name = "PolicyError"
  }
}

export const policy = tag<Policy>({ label: "sandbox.policy" })

export const impl = {
  read: tag<Read>({ label: "sandbox.impl.read" }),
  write: tag<Write>({ label: "sandbox.impl.write" }),
  run: tag<Run>({ label: "sandbox.impl.run" }),
}

export const read: Read = flow({
  name: "sandbox.read",
  parse: typed<ReadInput>(),
  deps: {
    runtime: session.session,
    authority: tags.optional(session.current.authority),
    policy: tags.required(policy),
    read: tags.required(impl.read),
  },
  factory: (ctx, { authority, runtime, policy: value, read: impl }) => {
    assertPolicy(authority ?? runtime.authority, value)
    assertPath(value, ctx.input.path)
    return impl.exec({ input: ctx.input })
  },
})

export const write: Write = flow({
  name: "sandbox.write",
  parse: typed<WriteInput>(),
  deps: {
    runtime: session.session,
    authority: tags.optional(session.current.authority),
    policy: tags.required(policy),
    write: tags.required(impl.write),
  },
  factory: (ctx, { authority, runtime, policy: value, write: impl }) => {
    assertPolicy(authority ?? runtime.authority, value)
    if (!value.write) throw new PolicyError("write is disabled")
    assertPath(value, ctx.input.path)
    return impl.exec({ input: ctx.input })
  },
})

export const exec: Run = flow({
  name: "sandbox.exec",
  parse: typed<ExecInput>(),
  deps: {
    runtime: session.session,
    authority: tags.optional(session.current.authority),
    policy: tags.required(policy),
    run: tags.required(impl.run),
  },
  factory: async function* (ctx, { authority, runtime, policy: value, run }): AsyncGenerator<ExecEvent, ExecResult, unknown> {
    assertPolicy(authority ?? runtime.authority, value)
    if (!value.commands.includes(ctx.input.command)) {
      throw new PolicyError(`command ${JSON.stringify(ctx.input.command)} is not allowed`)
    }
    const stream = run.execStream({ input: ctx.input })
    for await (const event of stream) yield event
    return stream.result
  },
})

function assertPolicy(authority: session.Authority, value: Policy): void {
  if (!Number.isFinite(value.timeoutMs) || value.timeoutMs <= 0) {
    throw new PolicyError("timeoutMs must be greater than zero")
  }
  if (!Number.isSafeInteger(value.maxOutputBytes) || value.maxOutputBytes <= 0) {
    throw new PolicyError("maxOutputBytes must be a positive safe integer")
  }
  if (value.write && !authority.sandbox.write) throw new PolicyError("write exceeds session authority")
  if (value.network && !authority.sandbox.network) throw new PolicyError("network exceeds session authority")
  if (!subset(value.roots, authority.sandbox.roots)) throw new PolicyError("roots exceed session authority")
  if (!subset(value.commands, authority.sandbox.commands)) throw new PolicyError("commands exceed session authority")
}

function assertPath(value: Policy, path: string): void {
  if (!path.startsWith("/")) throw new PolicyError("path must be absolute")
  const normalized = normalize(path)
  if (!value.roots.some((root) => within(normalized, normalize(root)))) {
    throw new PolicyError(`path ${JSON.stringify(path)} is outside allowed roots`)
  }
}

function subset(values: readonly string[], allowed: readonly string[]): boolean {
  return values.every((value) => allowed.includes(value))
}

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith("/") ? root : `${root}/`)
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return `/${parts.join("/")}`
}
