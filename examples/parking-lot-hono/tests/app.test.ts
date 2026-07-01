import { describe, expect, test } from "vitest"
import { createMemoryStore } from "@pumped-fn/parking-lot-shared"
import { createApp } from "../src"

describe("parking lot Hono app", () => {
  test("routes run shared flows through per-request Lite contexts", async () => {
    let at = "2026-07-01T08:00:00.000Z"
    const { app, scope } = createApp({
      at: () => at,
      store: createMemoryStore(),
    })
    const manager = { "content-type": "application/json", "x-actor-id": "manager-api", "x-role": "manager" }
    const operator = { "content-type": "application/json", "x-actor-id": "operator-api", "x-role": "operator" }
    const user = { "content-type": "application/json", "x-actor-id": "user-api", "x-role": "user" }

    const lotResponse = await app.request("/lots", {
      body: JSON.stringify({
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "Hono Garage",
        rateCentsPerHour: 600,
        refundWindowMinutes: 1440,
      }),
      headers: manager,
      method: "POST",
    })
    const lot = await lotResponse.json() as { id: string }

    const bookingResponse = await app.request("/bookings", {
      body: JSON.stringify({
        endAt: "2026-07-01T12:00:00.000Z",
        lotId: lot.id,
        plate: "api-111",
        startAt: "2026-07-01T10:00:00.000Z",
      }),
      headers: user,
      method: "POST",
    })
    expect(await bookingResponse.json()).toMatchObject({ status: "held", userId: "user-api" })

    const sessionResponse = await app.request("/check-ins", {
      body: JSON.stringify({ lotId: lot.id, plate: "api-222", userId: "user-api" }),
      headers: operator,
      method: "POST",
    })
    const session = await sessionResponse.json() as { id: string }
    at = "2026-07-01T08:50:00.000Z"
    const exitResponse = await app.request("/exits", {
      body: JSON.stringify({ sessionId: session.id }),
      headers: operator,
      method: "POST",
    })
    const prepared = await exitResponse.json() as { payment: { id: string } }
    const pairedResponse = await app.request("/payments/pair", {
      body: JSON.stringify({ externalRef: "api-payment", method: "card", paymentId: prepared.payment.id }),
      headers: operator,
      method: "POST",
    })
    expect(await pairedResponse.json()).toMatchObject({ receipt: { type: "charge" } })

    const reportResponse = await app.request("/reports", {
      body: JSON.stringify({}),
      headers: manager,
      method: "POST",
    })
    expect(await reportResponse.json()).toMatchObject({ totals: { revenueCents: 600 } })
    await scope.dispose()
  })
})
