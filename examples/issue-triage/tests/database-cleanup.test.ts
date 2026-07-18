import { createScope, preset } from "@pumped-fn/lite"
import type { Pool, PoolClient } from "pg"
import { afterEach, describe, expect, it } from "vitest"
import { config } from "../src/config.js"
import { database, syncIssues } from "../src/database.js"
import { postgresql } from "../src/postgresql.js"

const scopes: ReturnType<typeof createScope>[] = []
const targetPlan = {
  repositoryRoot: "/workspace/acme/payments",
  codePath: "src/checkout.ts",
  codeQuery: "checkout",
  databaseQuery: "SELECT * FROM pg_stat_statements",
  victoriaQuery: "checkout_latency_bucket",
  victoriaMaxWindowMs: 3_600_000,
  evidenceMaxAgeMs: 3_600_000,
  statementTimeoutMs: 5_000,
  maxEvidenceBytes: 65_536,
}

afterEach(async () => {
  await Promise.all(scopes.splice(0).map((scope) => scope.dispose()))
})

describe("database client cleanup", () => {
  it("releases the target client once when BEGIN READ ONLY rejects", async () => {
    const statements: string[] = []
    let releases = 0
    const client = {
      query: (statement: string) => {
        statements.push(statement)
        return Promise.reject(new Error("target begin failed"))
      },
      release: () => {
        releases += 1
      },
    } as unknown as PoolClient
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as Pool
    const scope = createScope({
      tags: [
        config.clock(() => Date.parse("2026-07-15T06:00:00.000Z")),
        config.plan(targetPlan),
      ],
      presets: [preset(database.target, () => pool)],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: postgresql,
      input: { sql: "SELECT * FROM pg_stat_statements" },
    })).rejects.toThrow("target begin failed")
    expect(statements).toEqual(["BEGIN READ ONLY"])
    expect(releases).toBe(1)
    await ctx.close()
  })

  it("releases the control client once when BEGIN rejects", async () => {
    const statements: string[] = []
    const releaseCauses: (Error | undefined)[] = []
    const client = {
      query: (statement: string) => {
        statements.push(statement)
        return statement === "BEGIN"
          ? Promise.reject(new Error("control begin failed"))
          : Promise.resolve({ rowCount: null, rows: [] })
      },
      release: (cause?: Error) => {
        releaseCauses.push(cause)
      },
    } as unknown as PoolClient
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as Pool
    const scope = createScope({
      presets: [preset(database.control, () => pool)],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: syncIssues,
      input: {
        repository: "acme/payments",
        issues: [],
        sinceAt: "2026-07-15T06:00:00.000Z",
      },
    })).rejects.toThrow("control begin failed")
    expect(statements).toEqual(["BEGIN", "ROLLBACK"])
    expect(releaseCauses).toEqual([undefined])
    await ctx.close()
  })

  it("keeps the target client reusable when error rollback succeeds", async () => {
    const statementError = new Error("target statement failed")
    const statements: string[] = []
    const releaseCauses: (Error | undefined)[] = []
    const client = {
      query: (statement: string) => {
        statements.push(statement)
        return statement.startsWith("SET LOCAL")
          ? Promise.reject(statementError)
          : Promise.resolve({ rowCount: null, rows: [] })
      },
      release: (cause?: Error) => {
        releaseCauses.push(cause)
      },
    } as unknown as PoolClient
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as Pool
    const scope = createScope({
      tags: [
        config.clock(() => Date.parse("2026-07-15T06:00:00.000Z")),
        config.plan(targetPlan),
      ],
      presets: [preset(database.target, () => pool)],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: postgresql,
      input: { sql: targetPlan.databaseQuery },
    })).rejects.toBe(statementError)
    expect(statements).toEqual(["BEGIN READ ONLY", "SET LOCAL statement_timeout = '5000ms'", "ROLLBACK"])
    expect(releaseCauses).toEqual([undefined])
    await ctx.close()
  })

  it("discards the target client when error rollback fails without replacing the statement error", async () => {
    const statementError = new Error("target statement failed")
    const rollbackError = new Error("target rollback failed")
    const releaseCauses: (Error | undefined)[] = []
    const client = {
      query: (statement: string) => {
        if (statement.startsWith("SET LOCAL")) return Promise.reject(statementError)
        if (statement === "ROLLBACK") return Promise.reject(rollbackError)
        return Promise.resolve({ rowCount: null, rows: [] })
      },
      release: (cause?: Error) => {
        releaseCauses.push(cause)
      },
    } as unknown as PoolClient
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as Pool
    const scope = createScope({
      tags: [
        config.clock(() => Date.parse("2026-07-15T06:00:00.000Z")),
        config.plan(targetPlan),
      ],
      presets: [preset(database.target, () => pool)],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: postgresql,
      input: { sql: targetPlan.databaseQuery },
    })).rejects.toBe(statementError)
    expect(releaseCauses).toEqual([rollbackError])
    await ctx.close()
  })

  it("discards the target client and throws rollback failure when it is the only error", async () => {
    const rollbackError = new Error("target rollback failed")
    const releaseCauses: (Error | undefined)[] = []
    const client = {
      query: (statement: string) => statement === "ROLLBACK"
        ? Promise.reject(rollbackError)
        : Promise.resolve({ rowCount: null, rows: [] }),
      release: (cause?: Error) => {
        releaseCauses.push(cause)
      },
    } as unknown as PoolClient
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as Pool
    const scope = createScope({
      tags: [
        config.clock(() => Date.parse("2026-07-15T06:00:00.000Z")),
        config.plan(targetPlan),
      ],
      presets: [preset(database.target, () => pool)],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: postgresql,
      input: { sql: targetPlan.databaseQuery },
    })).rejects.toBe(rollbackError)
    expect(releaseCauses).toEqual([rollbackError])
    await ctx.close()
  })

  it("discards the control client when rollback fails without replacing the statement error", async () => {
    const statementError = new Error("control begin failed")
    const rollbackError = new Error("control rollback failed")
    const releaseCauses: (Error | undefined)[] = []
    const client = {
      query: (statement: string) => statement === "ROLLBACK"
        ? Promise.reject(rollbackError)
        : Promise.reject(statementError),
      release: (cause?: Error) => {
        releaseCauses.push(cause)
      },
    } as unknown as PoolClient
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as Pool
    const scope = createScope({
      presets: [preset(database.control, () => pool)],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: syncIssues,
      input: {
        repository: "acme/payments",
        issues: [],
        sinceAt: "2026-07-15T06:00:00.000Z",
      },
    })).rejects.toBe(statementError)
    expect(releaseCauses).toEqual([rollbackError])
    await ctx.close()
  })
})
