import { flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import { Pool, type PoolClient } from "pg"
import { config } from "./config.js"
import { TriageError } from "./triage.js"

const migrations = [
  `CREATE TABLE IF NOT EXISTS github_watch_cursors (
    repository text PRIMARY KEY,
    since_at timestamptz NOT NULL,
    etag text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS issue_deliveries (
    repository text NOT NULL,
    issue_number integer NOT NULL,
    issue_updated_at timestamptz NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    state text NOT NULL CHECK (state IN ('pending', 'processing', 'acknowledged', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    lease_id text,
    lease_until timestamptz,
    receipt jsonb,
    last_error text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (repository, issue_number)
  )`,
  "CREATE INDEX IF NOT EXISTS issue_deliveries_claim_idx ON issue_deliveries (state, next_attempt_at, lease_until)",
  `CREATE TABLE IF NOT EXISTS issue_publications (
    authority_fingerprint text NOT NULL,
    idempotency_key text NOT NULL,
    payload_digest text NOT NULL,
    publication_id text NOT NULL,
    issue_id text NOT NULL,
    published_at timestamptz NOT NULL,
    PRIMARY KEY (authority_fingerprint, idempotency_key)
  )`,
  `CREATE TABLE IF NOT EXISTS session_records (
    id text PRIMARY KEY,
    version integer NOT NULL,
    record jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
] as const

export const database = {
  control: resource({
    name: "issue-triage.database.control",
    ownership: "boundary",
    deps: { url: tags.required(config.controlDatabaseUrl) },
    factory: async (ctx, { url }): Promise<Pool> => {
      const pool = new Pool({ connectionString: url, max: 10 })
      ctx.cleanup((target) => target.end(), pool)
      for (const statement of migrations) {
        await ctx.exec({
          fn: (target, sql) => target.query(sql),
          params: [pool, statement],
          name: "postgres.control.migrate",
          tags: [step({ workflow: true, kind: "database" })],
        })
      }
      return pool
    },
  }),
  target: resource({
    name: "issue-triage.database.target",
    ownership: "boundary",
    deps: { url: tags.required(config.targetDatabaseUrl) },
    factory: (ctx, { url }): Pool => {
      const pool = new Pool({ connectionString: url, max: 4 })
      ctx.cleanup((target) => target.end(), pool)
      return pool
    },
  }),
}

export const publication = {
  reservation: tag<PoolClient>({ label: "issue-triage.database.publication-reservation" }),
}

export interface GitHubIssue {
  readonly number: number
  readonly title: string
  readonly body: string
  readonly updatedAt: string
}

export interface SyncIssuesInput {
  readonly repository: string
  readonly issues: readonly GitHubIssue[]
  readonly sinceAt: string
  readonly etag?: string
}

export interface ClaimedIssue extends GitHubIssue {
  readonly repository: string
  readonly leaseId: string
  readonly attempt: number
}

export const syncIssues = flow({
  name: "issue-triage.database.sync-issues",
  parse: typed<SyncIssuesInput>(),
  deps: { pool: database.control },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool }): Promise<void> => {
    const client = await ctx.exec({
      fn: (target) => target.connect(),
      params: [pool],
      name: "postgres.control.connect",
    })
    await ctx.exec({
      fn: (target, sql) => target.query(sql),
      params: [client, "BEGIN"],
      name: "postgres.control.begin",
    })
    try {
      for (const issue of ctx.input.issues) {
        await ctx.exec({
          fn: (target, sql, values) => target.query(sql, [...values]),
          params: [
            client,
            `INSERT INTO issue_deliveries (
              repository, issue_number, issue_updated_at, title, body, state
            ) VALUES ($1, $2, $3, $4, $5, 'pending')
            ON CONFLICT (repository, issue_number) DO UPDATE SET
              issue_updated_at = EXCLUDED.issue_updated_at,
              title = EXCLUDED.title,
              body = EXCLUDED.body,
              state = CASE
                WHEN EXCLUDED.issue_updated_at > issue_deliveries.issue_updated_at THEN 'pending'
                ELSE issue_deliveries.state
              END,
              attempts = CASE
                WHEN EXCLUDED.issue_updated_at > issue_deliveries.issue_updated_at THEN 0
                ELSE issue_deliveries.attempts
              END,
              next_attempt_at = CASE
                WHEN EXCLUDED.issue_updated_at > issue_deliveries.issue_updated_at THEN now()
                ELSE issue_deliveries.next_attempt_at
              END,
              updated_at = now()`,
            [ctx.input.repository, issue.number, issue.updatedAt, issue.title, issue.body],
          ],
          name: "postgres.control.issue-upsert",
        })
      }
      await ctx.exec({
        fn: (target, sql, values) => target.query(sql, [...values]),
        params: [
          client,
          `INSERT INTO github_watch_cursors (repository, since_at, etag)
          VALUES ($1, $2, $3)
          ON CONFLICT (repository) DO UPDATE SET
            since_at = EXCLUDED.since_at,
            etag = EXCLUDED.etag,
            updated_at = now()`,
          [ctx.input.repository, ctx.input.sinceAt, ctx.input.etag ?? null],
        ],
        name: "postgres.control.cursor-upsert",
      })
      await ctx.exec({
        fn: (target, sql) => target.query(sql),
        params: [client, "COMMIT"],
        name: "postgres.control.commit",
      })
    } catch (error) {
      await ctx.exec({
        fn: (target, sql) => target.query(sql),
        params: [client, "ROLLBACK"],
        name: "postgres.control.rollback",
      })
      throw error
    } finally {
      await ctx.exec({
        fn: (target) => target.release(),
        params: [client],
        name: "postgres.control.release",
      })
    }
  },
})

export const readCursor = flow({
  name: "issue-triage.database.read-cursor",
  parse: typed<{ repository: string }>(),
  deps: { pool: database.control },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool }): Promise<{ sinceAt: string; etag?: string }> => {
    const result = await ctx.exec({
      fn: (target, sql, values) => target.query<{ since_at: Date; etag: string | null }>(sql, [...values]),
      params: [
        pool,
        "SELECT since_at, etag FROM github_watch_cursors WHERE repository = $1",
        [ctx.input.repository],
      ],
      name: "postgres.control.cursor-read",
    })
    const row = result.rows[0]
    if (!row) return { sinceAt: new Date(0).toISOString() }
    return {
      sinceAt: row.since_at.toISOString(),
      ...(row.etag === null ? {} : { etag: row.etag }),
    }
  },
})

export const claimIssue = flow({
  name: "issue-triage.database.claim-issue",
  parse: typed<{ repository: string; leaseId: string; leaseMs: number; maxAttempts: number }>(),
  deps: { pool: database.control },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool }): Promise<ClaimedIssue | undefined> => {
    const result = await ctx.exec({
      fn: (target, sql, values) => target.query<{
        repository: string
        issue_number: number
        title: string
        body: string
        issue_updated_at: Date
        attempts: number
      }>(sql, [...values]),
      params: [
        pool,
        `WITH candidate AS (
          SELECT repository, issue_number
          FROM issue_deliveries
          WHERE repository = $1
            AND attempts < $4
            AND (
              (state = 'pending' AND next_attempt_at <= now())
              OR (state = 'processing' AND lease_until < now())
            )
          ORDER BY next_attempt_at, issue_number
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE issue_deliveries AS delivery
        SET state = 'processing',
            attempts = delivery.attempts + 1,
            lease_id = $2,
            lease_until = now() + ($3 * interval '1 millisecond'),
            updated_at = now()
        FROM candidate
        WHERE delivery.repository = candidate.repository
          AND delivery.issue_number = candidate.issue_number
        RETURNING delivery.repository, delivery.issue_number, delivery.title, delivery.body,
          delivery.issue_updated_at, delivery.attempts`,
        [ctx.input.repository, ctx.input.leaseId, ctx.input.leaseMs, ctx.input.maxAttempts],
      ],
      name: "postgres.control.issue-claim",
    })
    const row = result.rows[0]
    if (!row) return undefined
    return {
      repository: row.repository,
      number: row.issue_number,
      title: row.title,
      body: row.body,
      updatedAt: row.issue_updated_at.toISOString(),
      leaseId: ctx.input.leaseId,
      attempt: row.attempts,
    }
  },
})

export const acknowledgeIssue = flow({
  name: "issue-triage.database.acknowledge-issue",
  parse: typed<{ leaseId: string; receipt: unknown }>(),
  deps: { pool: database.control },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool }): Promise<void> => {
    const result = await ctx.exec({
      fn: (target, sql, values) => target.query(sql, [...values]),
      params: [
        pool,
        `UPDATE issue_deliveries
        SET state = 'acknowledged', receipt = $2::jsonb, lease_id = NULL, lease_until = NULL, updated_at = now()
        WHERE lease_id = $1 AND state = 'processing'
        RETURNING issue_number`,
        [ctx.input.leaseId, JSON.stringify(ctx.input.receipt)],
      ],
      name: "postgres.control.issue-acknowledge",
    })
    if (result.rowCount !== 1) throw new TriageError("lease", ctx.input.leaseId, "Issue lease is no longer active")
  },
})

export const rejectIssue = flow({
  name: "issue-triage.database.reject-issue",
  parse: typed<{ leaseId: string; error: string; maxAttempts: number; retryAt: string }>(),
  deps: { pool: database.control },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool }): Promise<void> => {
    await ctx.exec({
      fn: (target, sql, values) => target.query(sql, [...values]),
      params: [
        pool,
        `UPDATE issue_deliveries
        SET state = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'pending' END,
            next_attempt_at = $4,
            last_error = $2,
            lease_id = NULL,
            lease_until = NULL,
            updated_at = now()
        WHERE lease_id = $1 AND state = 'processing'
        RETURNING issue_number`,
        [ctx.input.leaseId, ctx.input.error, ctx.input.maxAttempts, ctx.input.retryAt],
      ],
      name: "postgres.control.issue-reject",
    })
  },
})

export const issueLeaseValid = flow({
  name: "issue-triage.database.issue-lease-valid",
  parse: typed<{ leaseId: string }>(),
  deps: { pool: database.control },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool }): Promise<boolean> => {
    const result = await ctx.exec({
      fn: (target, sql, values) => target.query<{ valid: boolean }>(sql, [...values]),
      params: [
        pool,
        "SELECT lease_until > now() AS valid FROM issue_deliveries WHERE lease_id = $1 AND state = 'processing'",
        [ctx.input.leaseId],
      ],
      name: "postgres.control.issue-lease-valid",
    })
    return result.rows[0]?.valid === true
  },
})

export const readPublication = flow({
  name: "issue-triage.database.read-publication",
  parse: typed<{ authorityFingerprint: string; idempotencyKey: string }>(),
  deps: { reservation: tags.required(publication.reservation) },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { reservation }) => {
    const result = await ctx.exec({
      fn: (target, sql, values) => target.query<{
        payload_digest: string
        publication_id: string
        issue_id: string
        published_at: Date
      }>(sql, [...values]),
      params: [
        reservation,
        `SELECT payload_digest, publication_id, issue_id, published_at
        FROM issue_publications
        WHERE authority_fingerprint = $1 AND idempotency_key = $2`,
        [ctx.input.authorityFingerprint, ctx.input.idempotencyKey],
      ],
      name: "postgres.control.publication-read",
    })
    const row = result.rows[0]
    return row && {
      payloadDigest: row.payload_digest,
      publicationId: row.publication_id,
      issueId: row.issue_id,
      publishedAt: row.published_at.toISOString(),
    }
  },
})

export const savePublication = flow({
  name: "issue-triage.database.save-publication",
  parse: typed<{
    authorityFingerprint: string
    idempotencyKey: string
    payloadDigest: string
    publicationId: string
    issueId: string
    publishedAt: string
  }>(),
  deps: { reservation: tags.required(publication.reservation) },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { reservation }) => {
    const result = await ctx.exec({
      fn: (target, sql, values) => target.query<{ publication_id: string }>(sql, [...values]),
      params: [
        reservation,
        `INSERT INTO issue_publications (
          authority_fingerprint, idempotency_key, payload_digest, publication_id, issue_id, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (authority_fingerprint, idempotency_key) DO UPDATE SET
          publication_id = issue_publications.publication_id
        WHERE issue_publications.payload_digest = EXCLUDED.payload_digest
        RETURNING publication_id`,
        [
          ctx.input.authorityFingerprint,
          ctx.input.idempotencyKey,
          ctx.input.payloadDigest,
          ctx.input.publicationId,
          ctx.input.issueId,
          ctx.input.publishedAt,
        ],
      ],
      name: "postgres.control.publication-save",
    })
    if (!result.rows[0]) throw new TriageError("publish", ctx.input.idempotencyKey, "Publication idempotency key conflicts with another payload")
  },
})

export const reservePublication = flow({
  name: "issue-triage.database.reserve-publication",
  parse: typed<{
    authorityFingerprint: string
    idempotencyKey: string
    leaseId: string
    repository: string
    issue: number
  }>(),
  deps: { pool: database.control },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool }): Promise<PoolClient> => {
    const client = await ctx.exec({
      fn: (target) => target.connect(),
      params: [pool],
      name: "postgres.control.publication-connect",
    })
    try {
      await ctx.exec({
        fn: (target, sql) => target.query(sql),
        params: [client, "BEGIN"],
        name: "postgres.control.publication-begin",
      })
      await ctx.exec({
        fn: (target, sql, values) => target.query(sql, [...values]),
        params: [
          client,
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`${ctx.input.authorityFingerprint}:${ctx.input.idempotencyKey}`],
        ],
        name: "postgres.control.publication-lock",
      })
      const lease = await ctx.exec({
        fn: (target, sql, values) => target.query(sql, [...values]),
        params: [
          client,
          `SELECT issue_number
          FROM issue_deliveries
          WHERE lease_id = $1
            AND repository = $2
            AND issue_number = $3
            AND state = 'processing'
            AND lease_until > now()
          FOR UPDATE`,
          [ctx.input.leaseId, ctx.input.repository, ctx.input.issue],
        ],
        name: "postgres.control.publication-lease-fence",
      })
      if (lease.rowCount !== 1) {
        throw new TriageError("lease", ctx.input.leaseId, "Issue lease expired before publication")
      }
      return client
    } catch (error) {
      try {
        await ctx.exec({
          fn: (target, sql) => target.query(sql),
          params: [client, "ROLLBACK"],
          name: "postgres.control.publication-reservation-rollback",
        })
      } finally {
        await ctx.exec({
          fn: (target, cause) => target.release(cause),
          params: [client, error instanceof Error ? error : new Error(String(error))],
          name: "postgres.control.publication-reservation-discard",
        })
      }
      throw error
    }
  },
})

export const releasePublication = flow({
  name: "issue-triage.database.release-publication",
  parse: typed<{ commit: boolean }>(),
  deps: { reservation: tags.required(publication.reservation) },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { reservation }): Promise<void> => {
    try {
      await ctx.exec({
        fn: (target, sql) => target.query(sql),
        params: [reservation, ctx.input.commit ? "COMMIT" : "ROLLBACK"],
        name: `postgres.control.publication-${ctx.input.commit ? "commit" : "rollback"}`,
      })
    } catch (error) {
      await ctx.exec({
        fn: (target, cause) => target.release(cause),
        params: [reservation, error instanceof Error ? error : new Error(String(error))],
        name: "postgres.control.publication-discard",
      })
      throw error
    }
    await ctx.exec({
      fn: (target) => target.release(),
      params: [reservation],
      name: "postgres.control.publication-release",
    })
  },
})
