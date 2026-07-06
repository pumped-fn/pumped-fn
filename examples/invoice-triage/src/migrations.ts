import { createHash } from "node:crypto"

export type DatabaseStartupMode = "migrate" | "verify"

export interface DatabaseMigrationInfo {
  version: number
  name: string
  checksum: string
}

export interface DatabaseMigrationRecord extends DatabaseMigrationInfo {
  appliedAt: string
}

export interface DatabaseMigrationDrift {
  version: number
  appliedName: string
  appliedChecksum: string
  expectedName?: string
  expectedChecksum?: string
}

export interface DatabaseMigrationStatus {
  currentVersion: number
  targetVersion: number
  applied: readonly DatabaseMigrationRecord[]
  pending: readonly DatabaseMigrationInfo[]
  drift: readonly DatabaseMigrationDrift[]
}

export interface DatabaseMigrationReport extends DatabaseMigrationStatus {
  appliedNow: readonly DatabaseMigrationRecord[]
}

export interface DatabaseMigration extends DatabaseMigrationInfo {
  statements: readonly string[]
}

export const databaseMigrations = [
  migration(1, "create_invoice_store", [
    `CREATE TABLE IF NOT EXISTS invoice_pending (
      id text PRIMARY KEY,
      invoice jsonb NOT NULL,
      enqueued_at timestamptz NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS invoice_stored (
      id text PRIMARY KEY,
      invoice jsonb NOT NULL,
      classification jsonb NOT NULL,
      imported_at timestamptz NOT NULL,
      reminded_at timestamptz
    )`,
    `CREATE TABLE IF NOT EXISTS invoice_audit (
      sequence serial PRIMARY KEY,
      action text NOT NULL,
      entity_id text NOT NULL,
      occurred_at timestamptz NOT NULL,
      payload jsonb NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS invoice_pending_enqueued_at_idx ON invoice_pending (enqueued_at, id)",
    "CREATE INDEX IF NOT EXISTS invoice_stored_imported_at_idx ON invoice_stored (imported_at, id)",
    "CREATE INDEX IF NOT EXISTS invoice_stored_risk_idx ON invoice_stored ((classification->>'risk'))",
    "CREATE INDEX IF NOT EXISTS invoice_audit_occurred_at_idx ON invoice_audit (occurred_at, sequence)",
  ]),
] as const satisfies readonly DatabaseMigration[]

export const targetDatabaseVersion = databaseMigrations[databaseMigrations.length - 1]?.version ?? 0

export function migrationInfo(item: DatabaseMigration): DatabaseMigrationInfo {
  return { version: item.version, name: item.name, checksum: item.checksum }
}

export function migrationStatus(records: readonly DatabaseMigrationRecord[]): DatabaseMigrationStatus {
  const applied = [...records].sort((left, right) => left.version - right.version)
  const appliedVersions = new Set(applied.map((record) => record.version))
  const expected = new Map(databaseMigrations.map((item) => [item.version, item]))
  const drift = applied.flatMap((record): DatabaseMigrationDrift[] => {
    const item = expected.get(record.version)
    if (item === undefined) {
      return [{
        version: record.version,
        appliedName: record.name,
        appliedChecksum: record.checksum,
      }]
    }
    if (item.name === record.name && item.checksum === record.checksum) return []
    return [{
      version: record.version,
      appliedName: record.name,
      appliedChecksum: record.checksum,
      expectedName: item.name,
      expectedChecksum: item.checksum,
    }]
  })
  return {
    currentVersion: applied.reduce((version, record) => Math.max(version, record.version), 0),
    targetVersion: targetDatabaseVersion,
    applied,
    pending: databaseMigrations.filter((item) => !appliedVersions.has(item.version)).map(migrationInfo),
    drift,
  }
}

export function completedReport(applied: readonly DatabaseMigrationRecord[], appliedNow: readonly DatabaseMigrationRecord[]): DatabaseMigrationReport {
  return { ...migrationStatus(applied), appliedNow }
}

function migration(version: number, name: string, statements: readonly string[]): DatabaseMigration {
  return {
    version,
    name,
    checksum: createHash("sha256").update(`${version}:${name}\n${statements.join("\n")}`).digest("hex"),
    statements,
  }
}
