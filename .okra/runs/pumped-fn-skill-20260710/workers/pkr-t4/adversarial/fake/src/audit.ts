import type { Lite } from "@pumped-fn/lite"

export type AuditEntry = {
  kind: "exec" | "resolve"
  name: string
  parent: string | null
  ok: boolean
  durationMs: number
}

export const auditTrail = (options: { capacity: number; now: () => number }) => {
  const entries: AuditEntry[] = []
  const observe = async (
    header: Pick<AuditEntry, "kind" | "name" | "parent">,
    next: () => Promise<unknown>,
  ) => {
    const startedAt = options.now()
    const record = (ok: boolean) => {
      if (entries.length === options.capacity) entries.shift()
      entries.push({ ...header, ok, durationMs: options.now() - startedAt })
    }
    try {
      const value = await next()
      record(true)
      return value
    } catch (error) {
      record(false)
      throw error
    }
  }
  const extension: Lite.Extension = {
    name: "audit-trail",
    wrapResolve: (next, event) =>
      observe(
        {
          kind: "resolve",
          name:
            (event.kind === "resource" ? event.target.name : event.target.factory.name)
            || "anonymous",
          parent: null,
        },
        next,
      ),
    wrapExec: (next, target, ctx) =>
      observe(
        {
          kind: "exec",
          name: ctx.name ?? (typeof target === "function" ? target.name : target.name) ?? "anonymous",
          parent: ctx.parent?.name ?? null,
        },
        next,
      ),
  }
  return { extension, entries: () => entries.map((entry) => ({ ...entry })) }
}
