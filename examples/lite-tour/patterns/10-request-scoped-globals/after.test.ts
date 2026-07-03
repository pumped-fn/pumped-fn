import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  asyncSession,
  nestedSession,
  requestEvents,
  requestSession,
  requestUser,
  type RequestSession,
} from "./after"

describe("inside-out", () => {
  test("IO1: resource factory unit with preset", async () => {
    const fakeSession: RequestSession = {
      marker: Symbol("fake"),
      user: { id: "preset-user" },
    }
    const scope = createScope({
      presets: [preset(requestSession, fakeSession)],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: asyncSession })).resolves.toEqual({
      marker: fakeSession.marker,
      userId: "preset-user",
    })
  })
})

describe("outside-in", () => {
  test("OI1: two interleaved ctx.exec chains (async gaps) -> isolated instances; the before-code's corruption repro now passes", async () => {
    const scope = createScope()
    const alice = scope.createContext({ tags: [requestUser({ id: "alice" })] })
    const bob = scope.createContext({ tags: [requestUser({ id: "bob" })] })

    const [aliceResult, bobResult] = await Promise.all([
      alice.exec({ flow: nestedSession }),
      bob.exec({ flow: nestedSession }),
    ])

    expect(aliceResult).toMatchObject({
      firstUserId: "alice",
      sameInstance: true,
      secondUserId: "alice",
    })
    expect(bobResult).toMatchObject({
      firstUserId: "bob",
      sameInstance: true,
      secondUserId: "bob",
    })
    expect(aliceResult.marker).not.toBe(bobResult.marker)
  })

  test("OI2: child exec reads parent-owned instance (seek-up, single factory run for the chain)", async () => {
    const events: string[] = []
    const scope = createScope()
    const ctx = scope.createContext({
      tags: [requestUser({ id: "parent" }), requestEvents(events)],
    })

    await expect(ctx.exec({ flow: nestedSession })).resolves.toMatchObject({
      firstUserId: "parent",
      sameInstance: true,
      secondUserId: "parent",
    })
    expect(events).toEqual(["open:parent", "close:parent"])
  })

  test("OI3: sibling contexts (two scope.createContext()) never share", async () => {
    const scope = createScope()
    const left = scope.createContext({ tags: [requestUser({ id: "same-user" })] })
    const right = scope.createContext({ tags: [requestUser({ id: "same-user" })] })

    const leftSession = await left.resolve(requestSession)
    const rightSession = await right.resolve(requestSession)

    expect(leftSession.user.id).toBe("same-user")
    expect(rightSession.user.id).toBe("same-user")
    expect(leftSession.marker).not.toBe(rightSession.marker)
  })
})

describe("effect-managed", () => {
  test("E1: ctx.close() -> resource cleanup ran", async () => {
    const events: string[] = []
    const scope = createScope()
    const ctx = scope.createContext({
      tags: [requestUser({ id: "closer" }), requestEvents(events)],
    })

    await ctx.resolve(requestSession)
    await ctx.close()

    expect(events).toEqual(["open:closer", "close:closer"])
  })

  test("E2: ctx.release(r) owner-local: owner gets fresh on next resolve", async () => {
    const events: string[] = []
    const scope = createScope()
    const ctx = scope.createContext({
      tags: [requestUser({ id: "reset" }), requestEvents(events)],
    })

    const first = await ctx.resolve(requestSession)
    await ctx.release(requestSession)
    const second = await ctx.resolve(requestSession)

    expect(first.marker).not.toBe(second.marker)
    expect(events).toEqual(["open:reset", "close:reset", "open:reset"])
  })
})
