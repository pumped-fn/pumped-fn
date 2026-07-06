import { controller, flow, tags } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import { operationalFault } from "./errors"
import type { DatabaseMigrationReport, DatabaseMigrationStatus } from "./migrations"
import { clock, database, databaseStartup } from "./runtime"

export const migrateDatabase = flow({
  name: "invoice.database.migrate",
  deps: {
    database,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (_ctx, { database, clock }): Promise<DatabaseMigrationReport> =>
    database.migrate(clock.now().toISOString()),
})

export const verifyDatabase = flow({
  name: "invoice.database.verify",
  deps: {
    database,
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (_ctx, { database }): Promise<DatabaseMigrationStatus> => {
    const status = await database.migrationStatus()
    if (status.drift.length > 0 || status.pending.length > 0) {
      throw operationalFault("database-schema-not-current", "verify", "invoice_schema_migrations", {
        currentVersion: status.currentVersion,
        targetVersion: status.targetVersion,
        pending: status.pending.map((item) => item.version),
        drift: status.drift.map((item) => item.version),
      })
    }
    return status
  },
})

export const prepareDatabase = flow({
  name: "invoice.database.prepare",
  deps: {
    startup: tags.optional(databaseStartup),
    migrate: controller(migrateDatabase),
    verify: controller(verifyDatabase),
  },
  factory: async (_ctx, { startup, migrate, verify }): Promise<DatabaseMigrationReport | undefined> => {
    if (startup === "migrate") return migrate.exec()
    if (startup === "verify") return { ...await verify.exec(), appliedNow: [] }
    return undefined
  },
})
