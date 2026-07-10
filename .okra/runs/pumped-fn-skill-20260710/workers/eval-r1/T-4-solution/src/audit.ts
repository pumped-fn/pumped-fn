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
  const extension: Lite.Extension = {
    name: "audit-trail",
    async wrapExec(next, target, ctx) {
      const startedAt = now()
      const name = ctx.name ?? target.name ?? "unnamed-execution"
      ctx.onClose((result) => {
        record({
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
      const value = await next()
      const name = event.kind === "resource"
        ? event.target.name ?? "unnamed-resource"
        : event.target.factory.name || "unnamed-atom"
      record({
        kind: "resolve",
        name,
        parent: null,
        ok: true,
        durationMs: now() - startedAt,
      })
      return value
    },
  }
  return { extension, entries: () => [...recorded] }
}
