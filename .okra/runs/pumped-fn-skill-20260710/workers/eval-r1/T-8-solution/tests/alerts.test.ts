import { createScope, type Lite } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { channel, issueAlert, quietHours, type Alert } from "../src/alerts.ts"

describe("issueAlert", () => {
  it("fans out to every wired channel with the issued alert", async () => {
    const radio: Alert[] = []
    const siren: Alert[] = []
    const alert = { severity: "warning" as const, text: "whiteout", hour: 9 }
    const scope = createScope({
      tags: [
        channel({ name: "radio", send: sent => { radio.push(sent); return { delivered: true } } }),
        channel({ name: "siren", send: sent => { siren.push(sent); return { delivered: false } } }),
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: issueAlert, input: alert })).resolves.toEqual({
      attempted: 2,
      delivered: 1,
      suppressed: false,
    })
    expect(radio).toEqual([alert])
    expect(siren).toEqual([alert])

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("accounts for a throwing channel while recording its failed named execution", async () => {
    const sent: string[] = []
    const traces: Array<{ name: string | undefined; ok: boolean }> = []
    const observer: Lite.Extension = {
      name: "trace-recorder",
      async wrapExec(next, _target, ctx) {
        ctx.onClose(result => { traces.push({ name: ctx.name, ok: result.ok }) })
        return next()
      },
    }
    const scope = createScope({
      extensions: [observer],
      tags: [
        channel({ name: "radio", send: () => { sent.push("radio"); return { delivered: true } } }),
        channel({ name: "broken-siren", send: () => { sent.push("broken-siren"); throw new TypeError("jammed") } }),
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: issueAlert,
      input: { severity: "warning", text: "avalanche", hour: 12 },
    })).resolves.toEqual({ attempted: 2, delivered: 1, suppressed: false })
    expect(sent).toEqual(["radio", "broken-siren"])
    expect(traces.filter(trace => trace.name === "channel.send:broken-siren" && !trace.ok)).toHaveLength(1)

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("suppresses watches only in configured quiet hours", async () => {
    const sent: Alert[] = []
    const scope = createScope({
      tags: [
        channel({ name: "radio", send: alert => { sent.push(alert); return { delivered: true } } }),
        quietHours({ startHour: 1, endHour: 5 }),
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: issueAlert,
      input: { severity: "watch", text: "light snow", hour: 3 },
    })).resolves.toEqual({ attempted: 0, delivered: 0, suppressed: true })
    expect(sent).toEqual([])

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("delivers watches when quiet hours are absent", async () => {
    const sent: Alert[] = []
    const alert = { severity: "watch" as const, text: "light snow", hour: 3 }
    const scope = createScope({
      tags: [channel({ name: "radio", send: value => { sent.push(value); return { delivered: true } } })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: issueAlert, input: alert })).resolves.toEqual({
      attempted: 1,
      delivered: 1,
      suppressed: false,
    })
    expect(sent).toEqual([alert])

    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
