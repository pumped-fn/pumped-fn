import type { Lite } from "@pumped-fn/lite"
import { requestId } from "../tags"

export type ExecRecord = {
  kind: "exec"
  name: string | undefined
  durationMs: number
  ok: boolean
  requestId: string
}

export type ResolveRecord = {
  kind: "resolve"
  targetKind: "atom" | "resource"
}

export type ObservabilityRecord = ExecRecord | ResolveRecord

export interface ObservabilityOptions {
  now(): number
  nextRequestId(): string
}

export function observability(
  records: ObservabilityRecord[],
  options: ObservabilityOptions
): Lite.Extension {
  return {
    name: "capstone-observability",
    wrapResolve: async (next, event) => {
      records.push({ kind: "resolve", targetKind: event.kind })
      return next()
    },
    wrapExec: async (next, _target, ctx) => {
      let id = ctx.data.seekTag(requestId)
      if (id === undefined) {
        id = options.nextRequestId()
        ctx.data.setTag(requestId, id)
      }
      const started = options.now()
      try {
        const value = await next()
        records.push({
          kind: "exec",
          name: ctx.name,
          durationMs: options.now() - started,
          ok: true,
          requestId: id,
        })
        return value
      } catch (error) {
        records.push({
          kind: "exec",
          name: ctx.name,
          durationMs: options.now() - started,
          ok: false,
          requestId: id,
        })
        throw error
      }
    },
  }
}
