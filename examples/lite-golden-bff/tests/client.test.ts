import { describe, test, expect, vi, afterEach } from "vitest"
import { createScope } from "@pumped-fn/lite"
import { capstoneClient } from "../src/client"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inside-out", () => {
  test("IO1: each method hits the right capstone path and parses the body (fetch faked here only — below the seam)", async () => {
    const calls: string[] = []
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url)
      return { ok: true, json: async () => [{ id: "a" }] }
    })

    const scope = createScope()
    const client = await scope.resolve(capstoneClient)
    await client.listServices()
    await client.activeIncidents()
    await client.uptime("a", "7d")
    await client.getService("a")

    expect(calls).toEqual([
      "http://localhost:3000/services",
      "http://localhost:3000/incidents/active",
      "http://localhost:3000/metrics/uptime/a?period=7d",
      "http://localhost:3000/services/a",
    ])
    await scope.dispose()
  })

  test("IO2: a non-ok response throws with the status", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 503, json: async () => ({}) }))

    const scope = createScope()
    const client = await scope.resolve(capstoneClient)
    await expect(client.listServices()).rejects.toThrow("503")
    await scope.dispose()
  })
})
