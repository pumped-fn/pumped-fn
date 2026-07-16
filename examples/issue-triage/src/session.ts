import { flow, typed } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import * as session from "@pumped-fn/sdk/session"
import { z } from "zod"
import { database } from "./database.js"
import { collectEvidence, TriageError } from "./triage.js"

const fingerprint = z.templateLiteral(["sha256:", z.string().min(1)])
const sandboxAuthority = z.object({
  roots: z.array(z.string()),
  commands: z.array(z.string()),
  write: z.boolean(),
  network: z.boolean(),
}).strict()
const authorityInput = z.object({
  tenant: z.string(),
  roots: z.array(z.string()),
  permissions: z.array(z.string()),
  tools: z.array(z.string()),
  sandbox: sandboxAuthority,
}).strict()
const authorityShape = authorityInput.extend({ fingerprint }).strict()
const evidence = z.object({
  id: z.string(),
  kind: z.string(),
  digest: z.string().optional(),
}).strict()
const storedRecord = z.object({
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  schemaVersion: z.number().int().positive(),
  status: z.enum(["open", "finishing", "finished", "abandoned"]),
  authorityFingerprint: fingerprint,
  authorityConstraints: authorityInput,
  currentBranchId: z.string(),
  branches: z.array(z.object({
    id: z.string(),
    parentId: z.string().optional(),
    version: z.number().int().nonnegative(),
    createdBy: z.string(),
    authorityFingerprint: fingerprint,
    authority: authorityShape,
    evidence: z.array(evidence),
  }).strict()),
  work: z.array(z.object({
    id: z.string(),
    parentId: z.string().optional(),
    branchId: z.string(),
    role: z.string(),
    status: z.enum(["scheduled", "ready", "working", "waiting", "completed", "failed", "cancelled"]),
    policy: z.enum(["all", "fail-fast"]),
    attempt: z.number().int().nonnegative(),
    continuation: z.json().optional(),
    authority: authorityShape,
  }).strict()),
  attempts: z.array(z.object({
    workId: z.string(),
    attempt: z.number().int().nonnegative(),
    snapshotEpoch: z.number().int().nonnegative(),
    status: z.enum(["working", "waiting", "completed", "failed", "cancelled"]),
    startedAt: z.string().datetime(),
    settledAt: z.string().datetime().optional(),
  }).strict()),
  invocations: z.array(z.object({
    id: z.string(),
    workId: z.string(),
    attempt: z.number().int().nonnegative(),
    kind: z.enum(["model", "tool", "skill", "subagent", "database", "sandbox", "artifact", "memory", "adapter"]),
    status: z.enum(["working", "completed", "failed", "cancelled", "quarantined"]),
    idempotencyKey: z.string(),
  }).strict()),
  artifacts: z.array(z.object({
    id: z.string(),
    version: z.number().int().nonnegative(),
    digest: z.string(),
    mediaType: z.string(),
    authorityFingerprint: fingerprint,
    workId: z.string(),
    branchId: z.string(),
  }).strict()),
  memory: z.array(z.object({
    id: z.string(),
    version: z.number().int().nonnegative(),
    status: z.enum(["candidate", "accepted", "rejected"]),
    source: z.enum(["session", "human", "policy", "import"]),
    evidence: z.array(evidence),
    authorityFingerprint: fingerprint,
  }).strict()),
  schedules: z.array(z.object({
    id: z.string(),
    workId: z.string(),
    dueAt: z.string().datetime(),
    priority: z.number(),
    expectedSessionVersion: z.number().int().nonnegative(),
  }).strict()),
  providerContinuations: z.record(z.string(), z.string()),
  nextEventSequence: z.number().int().positive(),
}).strict() satisfies z.ZodType<session.SessionRecord>

export function initial(id: string, authority: session.Authority): session.SessionRecord {
  return {
    id,
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
    currentBranchId: "main",
    branches: [{
      id: "main",
      version: 0,
      createdBy: "github-watcher",
      authorityFingerprint: authority.fingerprint,
      authority,
      evidence: [],
    }],
    work: [],
    attempts: [],
    invocations: [],
    artifacts: [],
    memory: [],
    schedules: [],
    providerContinuations: {},
    nextEventSequence: 1,
  }
}

export function authority(tenant: string, repositoryRoot: string): session.Authority {
  return session.createAuthority({
    tenant,
    roots: [repositoryRoot],
    permissions: ["issues:write"],
    tools: [collectEvidence.name!],
    sandbox: {
      roots: [repositoryRoot],
      commands: ["git"],
      write: false,
      network: true,
    },
  })
}

const load: session.Load = flow({
  name: "issue-triage.session.load",
  parse: typed<{ id: string }>(),
  deps: { pool: database.control },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool }): Promise<session.SessionRecord> => {
    const result = await ctx.exec({
      deps: {},
      fn: (_deps, target, sql, values) => target.query<{ record: unknown }>(sql, [...values]),
      params: [pool, "SELECT record FROM session_records WHERE id = $1", [ctx.input.id]],
      name: "postgres.control.session-load",
    })
    const row = result.rows[0]
    if (!row) throw new TriageError("lease", ctx.input.id, "Session does not exist")
    return storedRecord.parse(row.record)
  },
})

const commit: session.Commit = flow({
  name: "issue-triage.session.commit",
  parse: typed<{ record: session.SessionRecord; expectedVersion: number }>(),
  deps: { pool: database.control },
  tags: [step({ workflow: true, kind: "database" })],
  factory: async (ctx, { pool }): Promise<{ version: number }> => {
    const version = ctx.input.expectedVersion + 1
    const record = { ...ctx.input.record, version }
    const result = await ctx.exec({
      deps: {},
      fn: (_deps, target, sql, values) => target.query<{ version: number }>(sql, [...values]),
      params: [
        pool,
        `INSERT INTO session_records (id, version, record)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          version = EXCLUDED.version,
          record = EXCLUDED.record,
          updated_at = now()
        WHERE session_records.version = $4
        RETURNING version`,
        [record.id, version, JSON.stringify(record), ctx.input.expectedVersion],
      ],
      name: "postgres.control.session-commit",
    })
    const committed = result.rows[0]
    if (!committed) throw new TriageError("lease", record.id, "Session version conflict")
    return committed
  },
})

export const sessionStore = {
  load,
  commit,
  bindings: [
    session.store.load(load),
    session.store.commit(commit),
  ],
}
