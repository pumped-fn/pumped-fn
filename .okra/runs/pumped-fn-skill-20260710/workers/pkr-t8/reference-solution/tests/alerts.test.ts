import { describe, expect, it } from "vitest"
import { createScope, type Lite } from "@pumped-fn/lite"
import { channel, issueAlert, quietHours, type Alert, type Channel, type ChannelReceipt } from "../src/alerts.ts"

class ChannelDown extends Error {
  constructor(readonly channelName: string) {
    super(`channel down: ${channelName}`)
  }
}

const recording = (name: string, log: Alert[], receipt: ChannelReceipt = { delivered: true }): Channel => ({
  name,
  send: (alert) => {
    log.push(alert)
    return receipt
  },
})

const jammed = (name: string, log: Alert[]): Channel => ({
  name,
  send: (alert) => {
    log.push(alert)
    throw new ChannelDown(name)
  },
})

const withScope = async (
  options: Parameters<typeof createScope>[0],
  run: (session: ReturnType<ReturnType<typeof createScope>["createContext"]>) => Promise<void>,
) => {
  const scope = createScope(options)
  const session = scope.createContext()
  await run(session)
  await session.close()
  await scope.dispose()
}

describe("issueAlert fan-out", () => {
  it("delivers through every registered channel and each channel sees the alert", async () => {
    const radio: Alert[] = []
    const siren: Alert[] = []
    const sms: Alert[] = []
    const alert: Alert = { severity: "warning", text: "storm front", hour: 12 }
    await withScope(
      {
        tags: [
          channel(recording("radio", radio)),
          channel(recording("siren", siren)),
          channel(recording("sms", sms)),
        ],
      },
      async (session) => {
        const outcome = await session.exec({ flow: issueAlert, input: alert })
        expect(outcome).toEqual({ attempted: 3, delivered: 3, suppressed: false })
        expect(radio).toEqual([alert])
        expect(siren).toEqual([alert])
        expect(sms).toEqual([alert])
      },
    )
  })

  it("a two-channel deployment differs only in wiring", async () => {
    const radio: Alert[] = []
    const siren: Alert[] = []
    const alert: Alert = { severity: "warning", text: "wind shift", hour: 12 }
    await withScope(
      { tags: [channel(recording("radio", radio)), channel(recording("siren", siren))] },
      async (session) => {
        const outcome = await session.exec({ flow: issueAlert, input: alert })
        expect(outcome).toEqual({ attempted: 2, delivered: 2, suppressed: false })
        expect(radio).toEqual([alert])
        expect(siren).toEqual([alert])
      },
    )
  })

  it("a throwing channel is still attempted, counts undelivered, stops nothing, and stays visible in traces", async () => {
    const before: Alert[] = []
    const broken: Alert[] = []
    const after: Alert[] = []
    const failures: { name: string | undefined; message: string }[] = []
    const observer: Lite.Extension = {
      name: "failure-observer",
      wrapExec: async (next, _target, execCtx) => {
        try {
          return await next()
        } catch (error) {
          failures.push({ name: execCtx.name, message: String(error) })
          throw error
        }
      },
    }
    const alert: Alert = { severity: "warning", text: "whiteout", hour: 12 }
    await withScope(
      {
        tags: [
          channel(recording("radio", before)),
          channel(jammed("siren", broken)),
          channel(recording("sms", after)),
        ],
        extensions: [observer],
      },
      async (session) => {
        const outcome = await session.exec({ flow: issueAlert, input: alert })
        expect(outcome).toEqual({ attempted: 3, delivered: 2, suppressed: false })
        expect(before).toEqual([alert])
        expect(broken).toEqual([alert])
        expect(after).toEqual([alert])
        const sirenFailures = failures.filter(
          (entry) => entry.name?.includes("siren") && entry.message.includes("channel down: siren"),
        )
        expect(sirenFailures).toHaveLength(1)
      },
    )
  })

  it("a declining channel counts attempted but not delivered", async () => {
    const ok: Alert[] = []
    const declining: Alert[] = []
    const alert: Alert = { severity: "warning", text: "avalanche risk", hour: 12 }
    await withScope(
      {
        tags: [
          channel(recording("radio", ok)),
          channel(recording("pager", declining, { delivered: false })),
        ],
      },
      async (session) => {
        const outcome = await session.exec({ flow: issueAlert, input: alert })
        expect(outcome).toEqual({ attempted: 2, delivered: 1, suppressed: false })
        expect(declining).toEqual([alert])
      },
    )
  })
})

describe("quiet hours", () => {
  const quietWiring = (radio: Alert[], siren: Alert[]) => ({
    tags: [
      channel(recording("radio", radio)),
      channel(recording("siren", siren)),
      quietHours({ startHour: 1, endHour: 5 }),
    ],
  })

  it("suppresses a watch inside the configured window and no channel is touched", async () => {
    const radio: Alert[] = []
    const siren: Alert[] = []
    await withScope(quietWiring(radio, siren), async (session) => {
      const outcome = await session.exec({
        flow: issueAlert,
        input: { severity: "watch", text: "light snow", hour: 3 },
      })
      expect(outcome).toEqual({ attempted: 0, delivered: 0, suppressed: true })
      expect(radio).toEqual([])
      expect(siren).toEqual([])
    })
  })

  it("still delivers warnings inside the window", async () => {
    const radio: Alert[] = []
    const siren: Alert[] = []
    await withScope(quietWiring(radio, siren), async (session) => {
      const outcome = await session.exec({
        flow: issueAlert,
        input: { severity: "warning", text: "flash flood", hour: 3 },
      })
      expect(outcome).toEqual({ attempted: 2, delivered: 2, suppressed: false })
      expect(radio).toHaveLength(1)
      expect(siren).toHaveLength(1)
    })
  })

  it("delivers a watch outside the window", async () => {
    const radio: Alert[] = []
    const siren: Alert[] = []
    await withScope(quietWiring(radio, siren), async (session) => {
      const outcome = await session.exec({
        flow: issueAlert,
        input: { severity: "watch", text: "fog bank", hour: 7 },
      })
      expect(outcome).toEqual({ attempted: 2, delivered: 2, suppressed: false })
    })
  })

  it("unconfigured wiring delivers everything, same flow, different scope", async () => {
    const radio: Alert[] = []
    const siren: Alert[] = []
    await withScope(
      { tags: [channel(recording("radio", radio)), channel(recording("siren", siren))] },
      async (session) => {
        const outcome = await session.exec({
          flow: issueAlert,
          input: { severity: "watch", text: "light snow", hour: 3 },
        })
        expect(outcome).toEqual({ attempted: 2, delivered: 2, suppressed: false })
        expect(radio).toHaveLength(1)
        expect(siren).toHaveLength(1)
      },
    )
  })
})
