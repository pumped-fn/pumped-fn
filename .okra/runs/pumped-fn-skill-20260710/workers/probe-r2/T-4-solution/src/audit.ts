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
  const trail: AuditEntry[] = []
  const record = (entry: AuditEntry) => {
    trail.push(entry)
    if (trail.length > 100) trail.shift()
  }
  return {
    extension: {
      name: "audit-trail",
      async wrapExec(next, target, ctx) {
        const started = now()
        const name = ctx.name ?? target.name ?? "anonymous-execution"
        let semanticOk = true
        ctx.onClose((result) => {
          record({
            kind: "exec",
            name,
            parent: ctx.parent?.name ?? null,
            ok: result.ok && semanticOk,
            durationMs: now() - started,
          })
        })
        const value = await next()
        if (name === "fleetops.dispatchPickup" && isRejectedPickup(value)) semanticOk = false
        return value
      },
      async wrapResolve(next, event) {
        const started = now()
        try {
          const value = await next()
          record({
            kind: "resolve",
            name: event.kind === "atom" ? event.target.factory.name || "anonymous-atom" : event.target.name ?? "anonymous-resource",
            parent: null,
            ok: true,
            durationMs: now() - started,
          })
          return value
        } catch (error) {
          record({
            kind: "resolve",
            name: event.kind === "atom" ? event.target.factory.name || "anonymous-atom" : event.target.name ?? "anonymous-resource",
            parent: null,
            ok: false,
            durationMs: now() - started,
          })
          throw error
        }
      },
    },
    entries: () => [...trail],
  }
}

function isRejectedPickup(value: unknown): value is { accepted: false } {
  return typeof value === "object" && value !== null && "accepted" in value && value.accepted === false
}
