import { preset } from "@pumped-fn/lite"
import { pumped } from "@pumped-fn/pumped"
import { describe, expect, it } from "vitest"
import {
  actor,
  bookSpace,
  clock,
  configureLot,
  createMemoryStore,
  expireBookings,
  listReceipts,
  readReport,
  store,
} from "@pumped-fn/parking-lot-shared"

function manifest(fixedClock: { value: string }): pumped.Manifest {
  return {
    app: {
      presets: [preset(store, createMemoryStore()), preset(clock, () => fixedClock.value)],
      context: (request?: Request) => {
        const role = (request?.headers.get("x-role") as "manager" | "operator" | "user" | null) ?? "manager"
        const id = request?.headers.get("x-actor-id") ?? "manager-1"
        return [actor({ id, role })]
      },
    },
    entries: [
      { kind: "server", name: "lots", file: "virtual", flow: configureLot },
      { kind: "server", name: "bookings", file: "virtual", flow: bookSpace },
      {
        kind: "server",
        name: "receipts",
        file: "virtual",
        flow: listReceipts,
        meta: pumped.route({ method: "GET" }),
      },
      { kind: "server", name: "reports", file: "virtual", flow: readReport },
      {
        kind: "jobs",
        name: "expire-bookings",
        file: "virtual",
        flow: expireBookings,
        meta: pumped.schedule({ cron: "*/5 * * * *" }),
      },
    ],
  }
}

describe("parking lot app composition", () => {
  it("books a session via HTTP, expires it via the job on one shared scope, and observes the audit trail", async () => {
    const fixedClock = { value: "2026-07-01T08:00:00.000Z" }
    const { app: honoApp, scope } = pumped.createServer(manifest(fixedClock))
    const jobs = pumped.runJobs(manifest(fixedClock), undefined, scope)

    const configured = await honoApp.request("/lots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bookingLeadMinutes: 120,
        capacity: 1,
        currency: "USD",
        graceMinutes: 15,
        name: "Integration Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 1440,
      }),
    })
    expect(configured.status).toBe(200)
    const lot = await configured.json()

    const booked = await honoApp.request("/bookings", {
      method: "POST",
      headers: { "content-type": "application/json", "x-role": "user", "x-actor-id": "user-1" },
      body: JSON.stringify({
        endAt: "2026-07-01T12:00:00.000Z",
        lotId: lot.id,
        plate: "int-001",
        startAt: "2026-07-01T09:00:00.000Z",
      }),
    })
    expect(booked.status).toBe(200)
    const booking = await booked.json()
    expect(booking.status).toBe("held")

    fixedClock.value = "2026-07-01T09:20:00.000Z"
    await jobs.tick({
      kind: "jobs",
      name: "expire-bookings",
      file: "virtual",
      flow: expireBookings,
      meta: pumped.schedule({ cron: "*/5 * * * *" }),
    })

    const receiptsRes = await honoApp.request(`/receipts?userId=${encodeURIComponent(booking.userId)}`)
    expect(receiptsRes.status).toBe(200)

    const reportRes = await honoApp.request("/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lotId: lot.id }),
    })
    const report = await reportRes.json()
    expect(report.lots[0].heldBookings).toBe(0)

    await jobs.stop()
    await scope.dispose()
  })

  it("resolves the receipts route and the expire-bookings schedule from entry.meta, since neither shared flow carries a route/schedule tag itself", async () => {
    const fixedClock = { value: "2026-07-01T08:00:00.000Z" }

    expect(pumped.route.find(listReceipts)).toBeUndefined()
    expect(pumped.schedule.find(expireBookings)).toBeUndefined()

    const { app: honoApp, scope } = pumped.createServer(manifest(fixedClock))
    const receiptsRes = await honoApp.request("/receipts?userId=nobody")
    expect(receiptsRes.status).toBe(200)

    const jobs = pumped.runJobs(manifest(fixedClock), undefined, scope)
    await jobs.stop()
    await scope.dispose()
  })
})
