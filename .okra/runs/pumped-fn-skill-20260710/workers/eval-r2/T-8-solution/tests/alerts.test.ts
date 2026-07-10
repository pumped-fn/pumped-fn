import { createScope, type Lite } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { channel, issueAlert, quietHours, type Alert } from "../src/alerts.ts"

describe("issueAlert", () => {
  it("fans out the alert and counts delivered receipts", async () => {
    const radio: Alert[] = []
    const siren: Alert[] = []
    const alert = { severity: "warning" as const, text: "ice storm", hour: 12 }
    const scope = createScope({
      tags: [
        channel({ name: "radio", send: (input) => { radio.push(input); return { delivered: true } } }),
        channel({ name: "siren", send: (input) => { siren.push(input); return { delivered: false } } }),
      ],
    })
    const session = scope.createContext()
    const run = session.exec({ flow: issueAlert, input: alert })

    await expect(run).resolves.toEqual({ attempted: 2, delivered: 1, suppressed: false })
    expect(radio).toEqual([alert])
    expect(siren).toEqual([alert])

    await session.close({ ok: true })
    await scope.dispose()
  })

  it("accounts for a failed channel while exposing its failed trace", async () => {
    const traces: Array<{ name: string | undefined; ok: boolean }> = []
    const observer: Lite.Extension = {
      name: "trace-observer",
      wrapExec(next, target, ctx) {
        ctx.onClose((result) => {
          traces.push({ name: ctx.name ?? target.name, ok: result.ok })
        })
        return next()
      },
    }
    const radio: Alert[] = []
    const siren: Alert[] = []
    const alert = { severity: "warning" as const, text: "avalanche risk", hour: 8 }
    const scope = createScope({
      extensions: [observer],
      tags: [
        channel({ name: "radio", send: (input) => { radio.push(input); return { delivered: true } } }),
        channel({ name: "siren", send: (input) => { siren.push(input); throw new Error("jammed") } }),
      ],
    })
    const session = scope.createContext()

    await expect(session.exec({ flow: issueAlert, input: alert })).resolves.toEqual({
      attempted: 2,
      delivered: 1,
      suppressed: false,
    })
    expect(radio).toEqual([alert])
    expect(siren).toEqual([alert])
    expect(traces.filter((trace) => trace.name === "alert.send.siren")).toEqual([
      { name: "alert.send.siren", ok: false },
    ])

    await session.close({ ok: true })
    await scope.dispose()
  })

  it("suppresses watches only when quiet hours are wired", async () => {
    const configuredCalls: Alert[] = []
    const configured = createScope({
      tags: [
        channel({ name: "radio", send: (alert) => { configuredCalls.push(alert); return { delivered: true } } }),
        quietHours({ startHour: 1, endHour: 5 }),
      ],
    })
    const configuredSession = configured.createContext()
    const alert = { severity: "watch" as const, text: "light snow", hour: 3 }

    await expect(configuredSession.exec({ flow: issueAlert, input: alert })).resolves.toEqual({
      attempted: 0,
      delivered: 0,
      suppressed: true,
    })
    expect(configuredCalls).toEqual([])
    await configuredSession.close({ ok: true })
    await configured.dispose()

    const absentCalls: Alert[] = []
    const absent = createScope({
      tags: [channel({ name: "radio", send: (input) => { absentCalls.push(input); return { delivered: true } } })],
    })
    const absentSession = absent.createContext()

    await expect(absentSession.exec({ flow: issueAlert, input: alert })).resolves.toEqual({
      attempted: 1,
      delivered: 1,
      suppressed: false,
    })
    expect(absentCalls).toEqual([alert])
    await absentSession.close({ ok: true })
    await absent.dispose()
  })
})
