import type { Lite } from "@pumped-fn/lite"

export interface AuditEntry {
  kind: "exec" | "resolve"
  name: string
  parent: string | null
  ok: boolean
  durationMs: number
}

export function auditTrail(now: () => number) {
  const records: AuditEntry[] = []
  const append = (entry: AuditEntry) => {
    records.push(entry)
    if (records.length > 100) records.shift()
  }

  const extension: Lite.Extension = {
    name: "audit-trail",
    async wrapExec(next, target, ctx) {
      const startedAt = now()
      const name = ctx.name ?? target.name ?? "anonymous-execution"
      ctx.onClose((result) => {
        append({
          kind: "exec",
          name,
          parent: ctx.parent?.name ?? null,
          ok: result.ok,
          durationMs: now() - startedAt,
        })
      })
      return next()
    },
    async wrapResolve(next, event) {
      const startedAt = now()
      const name = event.kind === "resource"
        ? event.target.name ?? "anonymous-resource"
        : event.target.factory.name || "anonymous-atom"
      try {
        const value = await next()
        append({ kind: "resolve", name, parent: null, ok: true, durationMs: now() - startedAt })
        return value
      } catch (error) {
        append({ kind: "resolve", name, parent: null, ok: false, durationMs: now() - startedAt })
        throw error
      }
    },
  }

  return { extension, entries: () => [...records] }
}
