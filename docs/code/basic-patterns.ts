import { provide, derive, createScope } from "@pumped-fn/core-next"
import { describe, it, expect } from "vitest"

// #region simple-provider
// [!code ++]
const config = provide(() => ({ port: 3000 }))

const scope = createScope()
const value = await scope.resolve(config)
console.log(value) // { port: 3000 }
// [!code --:6]

// Test validates example works
describe("simple provider", () => {
  it("resolves to value", async () => {
    expect(value.port).toBe(3000)
  })
})
// #endregion simple-provider

// #region derived-with-deps
// [!code --:2]
import { provide as p2, derive as d2, createScope as cs2 } from "@pumped-fn/core-next"

const logger = provide(() => ({
  info: (msg: string) => console.log(msg)
}))

const database = derive([logger], ([log]) => {
  return {
    query: (sql: string) => {
      log.info(`Query: ${sql}`)
      return []
    }
  }
})

const scope2 = createScope()
const db = await scope2.resolve(database)
db.query("SELECT * FROM users")
// [!code --:6]

describe("derived executor", () => {
  it("resolves with dependencies", async () => {
    expect(db.query).toBeDefined()
    expect(db.query("test")).toEqual([])
  })
})
// #endregion derived-with-deps

// #region multiple-dependencies
// [!code --:3]
import { provide as p3, derive as d3, createScope as cs3 } from "@pumped-fn/core-next"

const configSvc = provide(() => ({ dbPath: "./data.db" }))
const loggerSvc = provide(() => ({ info: (msg: string) => {} }))

const databaseSvc = derive([configSvc, loggerSvc], ([cfg, log]) => {
  log.info(`Connecting to ${cfg.dbPath}`)
  return { query: (sql: string) => [] }
})

const healthCheck = derive([databaseSvc, loggerSvc], ([db, log]) => ({
  check: async () => {
    const result = await db.query("SELECT 1")
    log.info("Health check passed")
    return result
  }
}))
// [!code --:7]

describe("multiple dependencies", () => {
  it("resolves complex graph", async () => {
    const scope3 = createScope()
    const check = await scope3.resolve(healthCheck)
    expect(check.check).toBeDefined()
  })
})
// #endregion multiple-dependencies
