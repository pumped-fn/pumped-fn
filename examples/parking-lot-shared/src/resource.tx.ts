import { resource, tags } from "@pumped-fn/lite"
import { store } from "./atom.store"
import type { Actor, AuditRecord } from "./model"
import type { ParkingStore } from "./store"
import { actor, now } from "./tags"

export interface Work {
  actor: Actor
  at(): string
  id(prefix: string): string
  record(type: string, targetId: string, data?: Record<string, string | number | boolean | null>): void
  store: ParkingStore
}

export const tx = resource({
  name: "parking.tx",
  ownership: "current",
  deps: {
    actor: tags.required(actor),
    now: tags.required(now),
    store,
  },
  factory: (ctx, { actor, now, store }): Work => {
    const events: AuditRecord[] = []
    ctx.cleanup(() => {
      for (const event of events) store.saveAudit(event)
    })
    return {
      actor,
      at: now,
      id: (prefix) => store.nextId(prefix),
      record: (type, targetId, data = {}) => {
        events.push({
          actorId: actor.id,
          at: now(),
          data,
          id: store.nextId("audit"),
          role: actor.role,
          targetId,
          type,
        })
      },
      store,
    }
  },
})
