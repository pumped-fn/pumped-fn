import { atom, tag, tags } from "@pumped-fn/lite"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { Pool } from "pg"
import { fileURLToPath } from "node:url"
import * as schema from "./schema"

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url))

export const databaseUrl = tag<string>({
  label: "invoice.databaseUrl",
  default: "postgres://invoice:invoice@localhost:5432/invoice_triage",
})

export const database = atom({
  keepAlive: true,
  deps: { url: tags.required(databaseUrl) },
  factory: async (ctx, { url }): Promise<Database> => {
    const pool = new Pool({ connectionString: url })
    const db = drizzle(pool, { schema })
    await migrate(db, { migrationsFolder })
    ctx.cleanup((target) => target.end(), pool)
    return db as Database
  },
})
