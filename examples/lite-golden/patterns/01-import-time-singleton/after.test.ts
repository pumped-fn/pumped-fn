import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  accountLookup,
  accountSummary,
  db,
  dbConfig,
  type DbClient,
} from "./after"

describe("inside-out", () => {
  test("IO1: resolve with scope-tag config -> client configured from tag value", async () => {
    const scope = createScope({
      tags: [dbConfig({ dsn: "db://primary", poolSize: 8 })],
    })

    const client = await scope.resolve(db)

    expect(client.dsn).toBe("db://primary")
    expect(client.poolSize).toBe(8)
    expect(client.closed).toBe(false)
    expect(client.readAccount("acct-1")).toBe("db://primary:acct-1")
    await scope.dispose()
  })

  test("IO2: consumer atom + preset(db, fakeClient) -> consumer works; real factory never ran", async () => {
    const fakeClient: DbClient = {
      closed: false,
      dsn: "fake://unit",
      id: Symbol("fake-client"),
      poolSize: 1,
      end: () => {},
      readAccount: (id) => `fake:${id}`,
    }
    const scope = createScope({
      presets: [preset(db, fakeClient)],
      tags: [dbConfig({ dsn: "db://would-run-if-not-preset", poolSize: 2 })],
    })
    let dbResolvingEvents = 0
    scope.on("resolving", db, () => {
      dbResolvingEvents++
    })

    await expect(scope.resolve(accountSummary)).resolves.toBe("fake:demo")

    expect(dbResolvingEvents).toBe(0)
    await scope.dispose()
  })

  test("IO3: factory throws on invalid config value (malformed dsn) -> scope failed event fires; resolve rejects", async () => {
    const scope = createScope({
      tags: [dbConfig({ dsn: "postgres://offline", poolSize: 4 })],
    })
    let failedEvents = 0
    scope.on("failed", db, () => {
      failedEvents++
    })

    await expect(scope.resolve(db)).rejects.toThrow("postgres://offline")

    expect(failedEvents).toBe(1)
    await scope.dispose()
  })
})

describe("outside-in", () => {
  test("OI1: boundary flow -> repo atom -> db atom chain; preset only db; flow output asserted", async () => {
    const fakeClient: DbClient = {
      closed: false,
      dsn: "fake://flow",
      id: Symbol("flow-client"),
      poolSize: 1,
      end: () => {},
      readAccount: (id) => `flow:${id}`,
    }
    const scope = createScope({
      presets: [preset(db, fakeClient)],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: accountLookup,
      input: { accountId: "acct-42" },
    })).resolves.toEqual({
      account: "flow:acct-42",
      dsn: "fake://flow",
    })
    await scope.dispose()
  })
})

describe("effect-managed", () => {
  test("E1: scope.dispose() -> end() called exactly once", async () => {
    const scope = createScope({
      tags: [dbConfig({ dsn: "db://dispose", poolSize: 3 })],
    })

    const client = await scope.resolve(db)
    expect(client.closed).toBe(false)
    await expect(scope.dispose()).resolves.toBeUndefined()
    await expect(scope.dispose()).resolves.toBeUndefined()

    expect(client.closed).toBe(true)
    expect(() => client.end()).toThrow("already closed")
  })

  test("E2: release(db) -> cleanup ran; re-resolve constructs a fresh client (identity differs)", async () => {
    const scope = createScope({
      tags: [dbConfig({ dsn: "db://release", poolSize: 5 })],
    })

    const first = await scope.resolve(db)
    await scope.release(db)
    const second = await scope.resolve(db)

    expect(first.closed).toBe(true)
    expect(second.closed).toBe(false)
    expect(first.id).not.toBe(second.id)
    await scope.dispose()
  })
})
