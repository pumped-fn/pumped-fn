import { createScope } from "@pumped-fn/lite"
import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchRequest, policy } from "../src/http.js"

const scopes: ReturnType<typeof createScope>[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(scopes.splice(0).map((scope) => scope.dispose()))
})

describe("HTTP adapter", () => {
  it("denies automatic redirects", async () => {
    const calls: RequestInit[] = []
    vi.stubGlobal("fetch", vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {})
      return Promise.resolve(new Response("ok"))
    }))
    const scope = createScope({
      tags: [policy({
        origins: ["https://api.github.test"],
        maxResponseBytes: 1_024,
      })],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: fetchRequest,
      input: {
        url: "https://api.github.test/start",
        method: "GET",
      },
    })).resolves.toMatchObject({ status: 200 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.redirect).toBe("error")
    await ctx.close()
  })
})
