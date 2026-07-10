import type { Lite } from "@pumped-fn/lite"

export type AuditEntry = {
  kind: "exec" | "resolve"
  name: string
  parent: string | null
  ok: boolean
  durationMs: number
}

export function auditTrail(now: () => number): {
  extension: Lite.Extension
  entries: () => AuditEntry[]
} {
  const recorded: AuditEntry[] = []
  const record = (entry: AuditEntry) => {
    recorded.push(entry)
    if (recorded.length > 100) recorded.shift()
  }
  return {
    extension: {
      name: "audit-trail",
      async wrapExec(next, target, ctx) {
        const startedAt = now()
        const name = ctx.name ?? target.name ?? "unnamed-execution"
        const parent = ctx.parent?.name ?? null
        ctx.onClose((result) => {
          record({ kind: "exec", name, parent, ok: result.ok, durationMs: now() - startedAt })
        })
        return next()
      },
      async wrapResolve(next, event) {
        const startedAt = now()
        const name = event.kind === "resource"
          ? ((event.target.name ?? event.target.factory.name) || "unnamed-unit")
          : event.target.factory.name || "fleet-state"
        try {
          const value = await next()
          record({ kind: "resolve", name, parent: null, ok: true, durationMs: now() - startedAt })
          return value
        } catch (error) {
          record({ kind: "resolve", name, parent: null, ok: false, durationMs: now() - startedAt })
          throw error
        }
      },
    },
    entries: () => [...recorded],
  }
}
