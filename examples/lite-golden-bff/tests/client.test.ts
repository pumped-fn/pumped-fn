import { describe, test, expect, vi, afterEach } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { capstoneClient, capstoneHttp, type CapstoneHttp } from "../src/client"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inside-out", () => {
  test("IO1: capstoneClient maps methods to capstoneHttp paths", async () => {
    const paths: string[] = []
    const http: CapstoneHttp = {
      get: async <T>(path: string) => {
        paths.push(path)
        return [{ id: "a" }] as T
      },
    }

    const scope = createScope({ presets: [preset(capstoneHttp, http)] })
    const client = await scope.resolve(capstoneClient)
    await client.listServices()
    await client.activeIncidents()
    await client.uptime("a", "7d")
    await client.getService("a")

    expect(paths).toEqual(["/services", "/incidents/active", "/metrics/uptime/a?period=7d", "/services/a"])
    await scope.dispose()
  })

  test("IO2: capstoneHttp builds the backend URL and parses the body", async () => {
    const calls: string[] = []
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url)
      return { ok: true, json: async () => [{ id: "a" }] }
    })

    const scope = createScope()
    const http = await scope.resolve(capstoneHttp)
    const result = await http.get("/services")

    expect(calls).toEqual(["http://localhost:3000/services"])
    expect(result).toEqual([{ id: "a" }])
    await scope.dispose()
  })

  test("IO3: capstoneHttp non-ok response throws with the status", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 503, json: async () => ({}) }))

    const scope = createScope()
    const http = await scope.resolve(capstoneHttp)
    await expect(http.get("/services")).rejects.toThrow("503")
    await scope.dispose()
  })
})
