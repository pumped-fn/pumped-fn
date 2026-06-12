import type { Lite } from "@pumped-fn/lite"
import { detectTransition, type IncidentEvent } from "../incidents"

export type AlertEvent = Exclude<IncidentEvent, { type: "none" }>

export type AlertHook = (event: AlertEvent) => void

export function alerting(): {
  extension: Lite.Extension
  onIncident(hook: AlertHook): () => void
} {
  const hooks = new Set<AlertHook>()
  return {
    onIncident(hook) {
      hooks.add(hook)
      return () => {
        hooks.delete(hook)
      }
    },
    extension: {
      name: "capstone-alerting",
      wrapExec: async (next, target) => {
        if (target !== detectTransition) return next()
        const event = await next() as IncidentEvent
        if (event.type !== "none") {
          for (const hook of hooks) hook(event)
        }
        return event
      },
    },
  }
}
