import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { fileURLToPath } from "node:url"
import type { Database } from "../../src/database"
import * as schema from "../../src/schema"

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url))

export async function pgliteDatabase(): Promise<Database> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return db as Database
}
