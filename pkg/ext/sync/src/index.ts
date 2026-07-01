import { atom, tag, type Lite } from "@pumped-fn/lite"

type MaybePromise<T> = T | Promise<T>

export namespace Sync {
  export type Value = Lite.JsonValue
  export type Failure = "isolate" | "throw"
  export type ErrorPhase = "read" | "write" | "subscribe" | "decode" | "encode" | "conflict"

  export interface Codec<T, Wire extends Value> {
    encode(value: T): Wire
    decode(raw: Wire): T
  }

  export interface Conflict<T> {
    readonly current: T
    readonly incoming: T
  }

  export interface Policy<T> {
    resolve(current: T, incoming: T): T | Conflict<T>
  }

  export interface Message {
    readonly key: string
    readonly peer: string
    readonly version: number
    readonly value: Value
  }

  export interface Transport {
    read(key: string): MaybePromise<Message | undefined>
    write(message: Message): MaybePromise<void>
    subscribe(key: string, listener: (message: Message) => void): () => void
    close?(): MaybePromise<void>
  }

  export interface Runtime {
    readonly peer: string
    readonly transport: Transport
    readonly namespace?: string
    readonly failure?: Failure
    readonly onError?: (error: unknown, phase: ErrorPhase, message: Message | undefined) => void
    readonly onConflict?: (conflict: Conflict<unknown>, message: Message) => void
  }

  export interface Options {
    readonly name?: string
  }

  export interface Base<T, D extends Record<string, Lite.AtomDependency> | undefined> {
    readonly id: string
    readonly deps?: D
    readonly factory: D extends Record<string, Lite.AtomDependency>
      ? (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
      : (ctx: Lite.ResolveContext) => MaybePromise<T>
    readonly tags?: Lite.Tagged<any>[]
    readonly keepAlive?: boolean
    readonly conflict?: Policy<NoInfer<T>>
  }

  export type Json<T extends Value, D extends Record<string, Lite.AtomDependency> | undefined> = Base<T, D>

  export type Encoded<
    T,
    Wire extends Value,
    D extends Record<string, Lite.AtomDependency> | undefined,
  > = Base<T, D> & {
    readonly codec: Codec<T, Wire>
  }

  export interface Memory extends Transport {
    records(): readonly Message[]
    clear(): void
    size(): number
  }
}

interface Active {
  readonly peer: string
  readonly transport: Sync.Transport
  readonly namespace: string | undefined
  readonly failure: Sync.Failure
  readonly onError: ((error: unknown, phase: Sync.ErrorPhase, message: Sync.Message | undefined) => void) | undefined
  readonly onConflict: ((conflict: Sync.Conflict<unknown>, message: Sync.Message) => void) | undefined
}

interface Spec<T, Wire extends Sync.Value> {
  readonly id: string
  readonly codec: Sync.Codec<T, Wire>
  readonly conflict: Sync.Policy<T> | undefined
}

interface Bound<T> {
  last: Sync.Value | undefined
  version: number
  applying: boolean
}

const meta = tag<Spec<any, Sync.Value>>({ label: "sync.meta" })
const runtime = tag<Sync.Runtime>({ label: "sync.runtime" })
const bound = Symbol("@pumped-fn/lite-extension-sync/bound")

const json: Sync.Codec<Sync.Value, Sync.Value> = {
  encode: assertValue,
  decode: assertValue,
}

function create<T extends Sync.Value>(config: Sync.Json<T, undefined>): Lite.Atom<T>
function create<T extends Sync.Value, const D extends Record<string, Lite.AtomDependency>>(config: Sync.Json<T, D>): Lite.Atom<T>
function create<T, const Wire extends Sync.Value>(config: Sync.Encoded<T, Wire, undefined>): Lite.Atom<T>
function create<T, const Wire extends Sync.Value, const D extends Record<string, Lite.AtomDependency>>(config: Sync.Encoded<T, Wire, D>): Lite.Atom<T>
function create(config: Sync.Base<unknown, Record<string, Lite.AtomDependency> | undefined> & { readonly codec?: Sync.Codec<unknown, Sync.Value> }): Lite.Atom<unknown> {
  const spec = {
    id: config.id,
    codec: config.codec ?? json,
    conflict: config.conflict,
  }

  if (config.deps) {
    return atom({
      deps: config.deps,
      factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<Record<string, Lite.AtomDependency>>) => {
        const value = config.factory(ctx, deps)
        if (isPromise(value)) return value.then((resolved) => validate(resolved, spec))
        return validate(value, spec)
      },
      tags: [meta(spec), ...(config.tags ?? [])],
      keepAlive: config.keepAlive ?? true,
    })
  }

  return atom({
    factory: (ctx: Lite.ResolveContext) => {
      const value = (config.factory as (ctx: Lite.ResolveContext) => MaybePromise<unknown>)(ctx)
      if (isPromise(value)) return value.then((resolved) => validate(resolved, spec))
      return validate(value, spec)
    },
    tags: [meta(spec), ...(config.tags ?? [])],
    keepAlive: config.keepAlive ?? true,
  })
}

function extension(options?: Sync.Options): Lite.Extension {
  return {
    name: options?.name ?? "sync",
    async wrapResolve(run, event) {
      if (event.kind !== "atom") return run()
      const spec = meta.find(event.target)
      if (!spec) return run()

      const local = await run()
      const current = active(event.scope)
      if (!current) return local
      if (event.ctx.data.get(bound)) return local

      const key = scopedKey(current, spec.id)
      const remote = await read(current, key)
      const value = remote ? decode(current, spec, remote, local) : local
      bind(event.scope, event.target, event.ctx, current, spec, key, remote?.value)
      return value
    },
  }
}

function memory(): Sync.Memory {
  const values = new Map<string, Sync.Message>()
  const messages: Sync.Message[] = []
  const listeners = new Map<string, Set<(message: Sync.Message) => void>>()

  return {
    read(key) {
      return values.get(key)
    },
    write(message) {
      values.set(message.key, message)
      messages.push(message)
      const found = listeners.get(message.key)
      if (found) {
        for (const listener of found) listener(message)
      }
    },
    subscribe(key, listener) {
      let found = listeners.get(key)
      if (!found) {
        found = new Set()
        listeners.set(key, found)
      }
      found.add(listener)
      return () => {
        found.delete(listener)
        if (found.size === 0) listeners.delete(key)
      }
    },
    records() {
      return messages.slice()
    },
    clear() {
      values.clear()
      messages.length = 0
    },
    size() {
      return messages.length
    },
    close() {
      listeners.clear()
    },
  }
}

function codec<T, const Wire extends Sync.Value>(value: Sync.Codec<T, Wire>): Sync.Codec<T, Wire> {
  return value
}

function revision<const K extends string>(read: K): {
  resolve<T extends Record<K, number>>(current: T, incoming: T): T | Sync.Conflict<T>
}
function revision<T>(read: (value: T) => number): Sync.Policy<T>
function revision(read: string | ((value: never) => number)) {
  const readVersion = versionReader(read)
  return {
    resolve(current: unknown, incoming: unknown) {
      const currentVersion = readVersion(current)
      const incomingVersion = readVersion(incoming)
      if (incomingVersion > currentVersion) return incoming
      if (incomingVersion < currentVersion || Object.is(current, incoming)) return current
      return { current, incoming }
    },
  }
}

function lww<const K extends string>(read: K): {
  resolve<T extends Record<K, number>>(current: T, incoming: T): T | Sync.Conflict<T>
}
function lww<T>(read: (value: T) => number): Sync.Policy<T>
function lww(read: string | ((value: never) => number)) {
  const readVersion = versionReader(read)
  return {
    resolve(current: unknown, incoming: unknown) {
      return readVersion(incoming) >= readVersion(current) ? incoming : current
    },
  }
}

export const sync = Object.assign(create, {
  runtime,
  extension,
  memory,
  codec,
  revision,
  lww,
})

function validate<T>(value: T, spec: Spec<T, Sync.Value>): T {
  spec.codec.encode(value)
  return value
}

function active(scope: Lite.Scope): Active | undefined {
  const value = runtime.find(scope as unknown as Lite.TagSource)
  if (!value) return undefined
  return {
    peer: value.peer,
    transport: value.transport,
    namespace: value.namespace,
    failure: value.failure ?? "isolate",
    onError: value.onError,
    onConflict: value.onConflict,
  }
}

async function read(current: Active, key: string): Promise<Sync.Message | undefined> {
  try {
    return await current.transport.read(key)
  } catch (error) {
    handleError(current, error, "read", undefined)
    return undefined
  }
}

function bind<T>(
  scope: Lite.Scope,
  target: Lite.Atom<unknown>,
  ctx: Lite.ResolveContext,
  current: Active,
  spec: Spec<T, Sync.Value>,
  key: string,
  last: Sync.Value | undefined
): void {
  const ctrl = scope.controller(target as Lite.Atom<T>)
  const state: Bound<T> = {
    last,
    version: 0,
    applying: false,
  }

  const offChange = ctrl.on("resolved", () => {
    if (state.applying) return
    const value = ctrl.get()
    const encoded = encode(current, spec, value)
    if (encoded === undefined || sameValue(encoded, state.last)) return
    state.version += 1
    state.last = encoded
    void write(current, {
      key,
      peer: current.peer,
      version: state.version,
      value: encoded,
    })
  })

  const offRemote = subscribe(current, key, (message) => {
    if (message.peer === current.peer) return
    apply(current, spec, ctrl, state, message)
  })

  const close = () => {
    offRemote()
    offChange()
  }
  ctx.cleanup(close)
  ctx.data.set(bound, state)
}

async function write(current: Active, message: Sync.Message): Promise<void> {
  try {
    await current.transport.write(message)
  } catch (error) {
    handleError(current, error, "write", message)
  }
}

function subscribe(current: Active, key: string, listener: (message: Sync.Message) => void): () => void {
  try {
    return current.transport.subscribe(key, (message) => {
      try {
        listener(message)
      } catch (error) {
        handleError(current, error, "subscribe", undefined, false)
      }
    })
  } catch (error) {
    handleError(current, error, "subscribe", undefined)
    return () => {}
  }
}

function apply<T>(
  current: Active,
  spec: Spec<T, Sync.Value>,
  ctrl: Lite.Controller<T>,
  state: Bound<T>,
  message: Sync.Message
): void {
  const incoming = decode(current, spec, message, undefined, false)
  if (incoming === undefined) return

  const next = resolveConflict(current, spec, ctrl.get(), incoming, message, false)
  if (next === undefined) return
  if (isConflict(next)) {
    current.onConflict?.(next, message)
    return
  }

  const encoded = encode(current, spec, next, false)
  if (encoded === undefined || sameValue(encoded, state.last)) return

  state.applying = true
  state.last = encoded
  state.version = Math.max(state.version, message.version)
  ctrl.set(next)
  state.applying = false
}

function encode<T>(current: Active, spec: Spec<T, Sync.Value>, value: T, throwOnFailure = true): Sync.Value | undefined {
  try {
    return spec.codec.encode(value)
  } catch (error) {
    handleError(current, error, "encode", undefined, throwOnFailure)
    return undefined
  }
}

function decode<T>(current: Active, spec: Spec<T, Sync.Value>, message: Sync.Message, fallback: T): T
function decode<T>(current: Active, spec: Spec<T, Sync.Value>, message: Sync.Message, fallback: undefined): T | undefined
function decode<T>(current: Active, spec: Spec<T, Sync.Value>, message: Sync.Message, fallback: T, throwOnFailure: boolean): T
function decode<T>(
  current: Active,
  spec: Spec<T, Sync.Value>,
  message: Sync.Message,
  fallback: undefined,
  throwOnFailure: boolean
): T | undefined
function decode<T>(
  current: Active,
  spec: Spec<T, Sync.Value>,
  message: Sync.Message,
  fallback: T | undefined,
  throwOnFailure = true
): T | undefined {
  try {
    const wire = assertValue(message.value)
    return spec.codec.decode(wire)
  } catch (error) {
    handleError(current, error, "decode", message, throwOnFailure)
    return fallback
  }
}

function resolveConflict<T>(
  current: Active,
  spec: Spec<T, Sync.Value>,
  local: T,
  incoming: T,
  message: Sync.Message,
  throwOnFailure = true
): T | Sync.Conflict<T> | undefined {
  if (!spec.conflict) return incoming
  try {
    return spec.conflict.resolve(local, incoming)
  } catch (error) {
    handleError(current, error, "conflict", message, throwOnFailure)
    return undefined
  }
}

function handleError(
  current: Active,
  error: unknown,
  phase: Sync.ErrorPhase,
  message: Sync.Message | undefined,
  throwOnFailure = true
): void {
  current.onError?.(error, phase, message)
  if (throwOnFailure && current.failure === "throw") throw error
}

function versionReader(read: string | ((value: never) => number)): (value: unknown) => number {
  if (typeof read === "function") {
    const readVersion = read as (value: unknown) => number
    return (value) => assertVersion(readVersion(value))
  }

  return (value) => {
    if (value === null || typeof value !== "object") throw new Error("Sync revision value must be an object")
    const version = (value as Record<string, unknown>)[read]
    if (typeof version !== "number") throw new Error("Sync revision field must be a number")
    return assertVersion(version)
  }
}

function assertVersion(value: number): number {
  if (Number.isFinite(value)) return value
  throw new Error("Sync revision field must be finite")
}

function isConflict<T>(value: T | Sync.Conflict<T>): value is Sync.Conflict<T> {
  return typeof value === "object"
    && value !== null
    && "current" in value
    && "incoming" in value
}

function scopedKey(current: Active, id: string): string {
  return current.namespace ? `${current.namespace}:${id}` : id
}

function isPromise<T>(value: MaybePromise<T>): value is Promise<T> {
  return value != null && typeof (value as Promise<T>).then === "function"
}

function assertValue(value: unknown): Sync.Value {
  if (value === null) return null

  switch (typeof value) {
    case "string":
    case "boolean":
      return value
    case "number":
      if (Number.isFinite(value)) return value
      throw new Error("Sync value number must be finite")
    case "object":
      if (Array.isArray(value)) return value.map(assertValue)
      if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Sync value must be plain JSON")
      return assertRecord(value as Record<string, unknown>)
    default:
      throw new Error("Sync value must be plain JSON")
  }
}

function assertRecord(value: Record<string, unknown>): Sync.Value {
  const result: Record<string, Sync.Value> = {}
  for (const key of Object.keys(value)) {
    result[key] = assertValue(value[key])
  }
  return result
}

function sameValue(left: Sync.Value | undefined, right: Sync.Value | undefined): boolean {
  if (left === undefined || right === undefined) return left === right
  if (Object.is(left, right)) return true
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) return sameArray(left, right)

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  const leftRecord = left as { readonly [key: string]: Sync.Value }
  const rightRecord = right as { readonly [key: string]: Sync.Value }
  for (const key of leftKeys) {
    if (!Object.hasOwn(rightRecord, key)) return false
    if (!sameValue(leftRecord[key], rightRecord[key])) return false
  }
  return true
}

function sameArray(left: Sync.Value, right: Sync.Value): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (!sameValue(left[i], right[i])) return false
  }
  return true
}
