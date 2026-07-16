import { flow, tags, typed } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import { config } from "./config.js"
import { database } from "./database.js"
import { digest, isReadOnlySQL, ports, TriageError, type Evidence, type PostgreSQLRead } from "./triage.js"

function bounded(value: unknown, maxBytes: number): string {
  const encoded = JSON.stringify(value)
  return Buffer.byteLength(encoded) <= maxBytes
    ? encoded
    : `${encoded.slice(0, maxBytes)}…`
}

export const postgresql = flow({
  name: "issue-triage.postgresql.read",
  parse: typed<PostgreSQLRead>(),
  deps: {
    pool: database.target,
    plan: tags.required(config.plan),
    clock: tags.required(config.clock),
  },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool, plan, clock }): Promise<Evidence> => {
    if (ctx.input.sql !== plan.databaseQuery || !isReadOnlySQL(ctx.input.sql)) {
      throw new TriageError("authorize", ctx.input.sql, "Database request does not match the configured read-only query")
    }
    const client = await ctx.exec({
      fn: (target) => target.connect(),
      params: [pool],
      name: "postgres.target.connect",
    })
    await ctx.exec({
      fn: (target, sql) => target.query(sql),
      params: [client, "BEGIN READ ONLY"],
      name: "postgres.target.begin-read-only",
    })
    try {
      await ctx.exec({
        fn: (target, sql) => target.query(sql),
        params: [client, `SET LOCAL statement_timeout = '${plan.statementTimeoutMs}ms'`],
        name: "postgres.target.statement-timeout",
      })
      const schema = await ctx.exec({
        fn: (target, sql) => target.query<{
          table_schema: string
          table_name: string
          column_name: string
          data_type: string
        }>(sql),
        params: [
          client,
          `SELECT table_schema, table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema, table_name, ordinal_position
          LIMIT 500`,
        ],
        name: "postgres.target.inspect-schema",
      })
      ctx.signal.throwIfAborted()
      const explanation = await ctx.exec({
        fn: (target, sql) => target.query<{ "QUERY PLAN": unknown }>(sql),
        params: [client, `EXPLAIN (FORMAT JSON, ANALYZE FALSE, BUFFERS FALSE) ${ctx.input.sql}`],
        name: "postgres.target.explain-query",
      })
      ctx.signal.throwIfAborted()
      await ctx.exec({
        fn: (target, sql) => target.query(sql),
        params: [client, "ROLLBACK"],
        name: "postgres.target.rollback-read-only",
      })
      return {
        id: `postgresql:${digest(ctx.input)}`,
        source: "postgresql",
        citation: `postgresql://target/explain?query=${encodeURIComponent(digest(ctx.input))}`,
        capturedAt: new Date(clock()).toISOString(),
        maxAgeMs: plan.evidenceMaxAgeMs,
        queryIdentity: digest(ctx.input),
        capabilityScope: "postgresql:read-only",
        summary: bounded({ schema: schema.rows, explanation: explanation.rows }, plan.maxEvidenceBytes),
      }
    } catch (error) {
      await ctx.exec({
        fn: (target, sql) => target.query(sql),
        params: [client, "ROLLBACK"],
        name: "postgres.target.rollback-error",
      })
      throw error
    } finally {
      await ctx.exec({
        fn: (target) => target.release(),
        params: [client],
        name: "postgres.target.release",
      })
    }
  },
})

export const postgresqlBinding = ports.postgresql(postgresql)
