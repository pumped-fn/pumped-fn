import { preset, type Lite } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { createApp } from "../src/app"
import { checkExecutors } from "../src/checker"
import { alerting } from "../src/extensions/alerting"
import { activeIncidents, detectTransition } from "../src/incidents"
import { clock } from "../src/infra/clock"
import { FakeClock } from "./fakes"

describe("outside-in", () => {
  test("OI-SC8: custom hook receives open and resolve incident events end-to-end", async () => {
    const fakeClock = new FakeClock()
    const statuses: Array<"unhealthy" | "healthy"> = ["unhealthy", "healthy"]
    const alerts = alerting()
    const events: string[] = []
    const off = alerts.onIncident(() => {
      events.push("removed")
    })
    off()
    alerts.onIncident((event) => {
      events.push(`${event.type}:${event.incident.serviceId}`)
    })
    const app = createApp({
      extensions: [alerts.extension],
      presets: [
        preset(clock, fakeClock),
        preset(checkExecutors, {
          http: async () => ({ status: statuses.shift() ?? "healthy", responseTime: 3, error: null }),
          tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
          custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
        }),
      ],
    })

    await app.api.startScheduler()
    const service = await app.api.registerService({
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "critical",
    })

    await fakeClock.advance(60_000)
    expect(await app.api.activeIncidentCount()).toBe(1)
    await fakeClock.advance(60_000)
    expect(await app.api.activeIncidentCount()).toBe(0)
    expect(events).toEqual([`open:${service.id}`, `resolve:${service.id}`])
    await app.scope.dispose()
  })
})

describe("inside-out", () => {
  test("IO1: alerting extension passes through executions of other targets", async () => {
    const alerts = alerting()
    const events: string[] = []
    alerts.onIncident((event) => {
      events.push(event.type)
    })

    expect(await alerts.extension.wrapExec!(async () => "ignored", activeIncidents as Lite.ExecTarget, {} as never)).toBe("ignored")
    expect(events).toEqual([])
  })

  test("IO2: alerting extension ignores transitions that report no incident", async () => {
    const alerts = alerting()
    const events: string[] = []
    alerts.onIncident((event) => {
      events.push(event.type)
    })

    expect(await alerts.extension.wrapExec!(
      async () => ({ type: "none", incident: null }),
      detectTransition as Lite.ExecTarget,
      {} as never,
    )).toEqual({ type: "none", incident: null })
    expect(events).toEqual([])
  })
})
