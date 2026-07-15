import { type Lite, type MaybePromise } from "./types"
import { isFlow } from "./flow"

function isObjectKey(value: unknown): value is object {
  return (typeof value === "object" || typeof value === "function") && value !== null
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isObjectKey(value) && typeof (value as { readonly then?: unknown }).then === "function"
}

export function isAsyncGeneratorFunction(value: unknown): boolean {
  return typeof value === "function" && Object.prototype.toString.call(value) === "[object AsyncGeneratorFunction]"
}

export function isAsyncGenerator(value: unknown): value is AsyncGenerator<unknown, unknown, unknown> {
  return isObjectKey(value) && Object.prototype.toString.call(value) === "[object AsyncGenerator]"
}

function isAsyncStream(value: unknown): boolean {
  if (!isObjectKey(value)) return false
  return typeof (value as { readonly [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
}

function assertNoReturnedStream(value: unknown): unknown {
  if (isAsyncStream(value)) {
    throw new Error("Flow returned an async iterable from a non-generator factory; use an async generator flow for yields or an iterable atom with resolveStream().")
  }
  return value
}

export function consumeScalarResult(value: unknown): MaybePromise<unknown> {
  if (isAsyncGenerator(value)) return drainGenerator(value)
  return isPromiseLike(value)
    ? Promise.resolve(value).then(assertNoReturnedStream)
    : assertNoReturnedStream(value)
}

export async function drainGenerator(generator: AsyncGenerator<unknown, unknown, unknown>): Promise<unknown> {
  for (;;) {
    const result = await generator.next()
    if (result.done) return result.value
  }
}

export function requireAsyncGenerator(value: unknown): AsyncGenerator<unknown, unknown, unknown> {
  if (isAsyncGenerator(value)) return value
  throw new Error("execStream() requires an async generator flow; use exec() to run scalar flows.")
}

export function streamResultBeforeStartError(): Error {
  return new Error("execStream()/runStream().result is unavailable before iteration begins; use exec() to drain from a context or run() from a scope.")
}

const streamingExecSymbol = Symbol("pumped-fn.streamingExec")
const streamingExecTargets = new WeakSet<object>()

export function markStreamingExec(ctx: Lite.ExecutionContext, target: Lite.ExecTarget): void {
  ctx.data.set(streamingExecSymbol, target)
}

export function registerStreamingExec(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): () => void {
  ctx.data.set(streamingExecSymbol, target)
  if (isObjectKey(target)) streamingExecTargets.add(target)
  return () => {
    ctx.data.delete(streamingExecSymbol)
    if (isObjectKey(target)) streamingExecTargets.delete(target)
  }
}

export function isStreamingExec(target: Lite.ExecTarget, ctx?: Lite.ExecutionContext): boolean {
  if (isFlow(target) && isAsyncGeneratorFunction(target.factory)) return true
  if (ctx?.data.seek(streamingExecSymbol) === target) return true
  return isObjectKey(target) && streamingExecTargets.has(target)
}
