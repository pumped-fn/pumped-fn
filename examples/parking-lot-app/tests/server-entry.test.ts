import { preset } from "@pumped-fn/lite"
import { pumped } from "@pumped-fn/pumped"
import { describe, expect, it } from "vitest"
import {
  actor,
  bookSpace,
  checkInVehicle,
  configureLot,
  createMemoryStore,
  now,
  pairPayment,
  prepareExit,
  readReport,
  store,
} from "@pumped-fn/parking-lot-shared"

function manifest(): pumped.Manifest {
  return {
    app: {
      presets: [preset(store, createMemoryStore())],
      context: () => [actor({ id: "manager-1", role: "manager" }), now(() => "2026-07-01T08:00:00.000Z")],
    },
    entries: [
      { kind: "server", name: "lots", file: "virtual", flow: configureLot },
      { kind: "server", name: "bookings", file: "virtual", flow: bookSpace },
      { kind: "server", name: "check-ins", file: "virtual", flow: checkInVehicle },
      { kind: "server", name: "exits", file: "virtual", flow: prepareExit },
      { kind: "server", name: "payments-pair", file: "virtual", flow: pairPayment },
      { kind: "server", name: "reports", file: "virtual", flow: readReport },
    ],
  }
}

describe("parking lot app server entry", () => {
  it("configures a lot and reads it back through a real Hono round trip", async () => {
    const { app: honoApp, scope } = pumped.createServer(manifest())

    const configured = await honoApp.request("/lots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bookingLeadMinutes: 120,
        capacity: 10,
        currency: "USD",
        graceMinutes: 10,
        name: "Airport",
        rateCentsPerHour: 400,
        refundWindowMinutes: 1440,
      }),
    })
    expect(configured.status).toBe(200)
    const lot = await configured.json()
    expect(lot.name).toBe("Airport")

    const reported = await honoApp.request("/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lotId: lot.id }),
    })
    expect(reported.status).toBe(200)
    const report = await reported.json()
    expect(report.lots).toHaveLength(1)
    expect(report.lots[0].lotId).toBe(lot.id)

    await scope.dispose()
  })
})
