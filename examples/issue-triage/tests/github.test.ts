import { createScope, preset, type Lite } from "@pumped-fn/lite"
import type { Pool, PoolClient } from "pg"
import { afterEach, describe, expect, it } from "vitest"
import { config } from "../src/config.js"
import {
  claimIssue,
  control,
  publication,
  readCursor,
  readPublication,
  rejectIssue,
  releasePublication,
  reservePublication,
  savePublication,
  syncIssues,
} from "../src/database.js"
import { issueIntake, publisher, randomId, verifier } from "../src/github.js"
import { fetchRequest, type ResponseOutput } from "../src/http.js"
import { head } from "../src/repository.js"
import { timers } from "../src/runtime.js"
import { digest, type PublicationInput, type VerificationInput } from "../src/triage.js"

const scopes: ReturnType<typeof createScope>[] = []
const paginationCases = Object.freeze([
  { name: "relative URL with enterprise path", apiUrl: "https://api.github.test/api/v3", link: "?page=2", allowed: true },
  { name: "normalized host and default port", apiUrl: "https://api.github.test", link: "https://API.GITHUB.TEST:443/page-2", allowed: true },
  { name: "relative URL over HTTP", apiUrl: "http://api.github.test", link: "/page-2", allowed: true },
  { name: "nondefault port", apiUrl: "https://api.github.test", link: "https://api.github.test:444/page-2", allowed: false },
  { name: "different scheme", apiUrl: "https://api.github.test", link: "http://api.github.test/page-2", allowed: false },
  { name: "blob URL", apiUrl: "https://api.github.test", link: "blob:https://api.github.test/page-2", allowed: false },
  { name: "URL credentials", apiUrl: "https://api.github.test", link: "https://user:pass@api.github.test/page-2", allowed: false },
])

function publicationInput(): PublicationInput {
  return {
    authorityFingerprint: `sha256:${"f".repeat(64)}`,
    leaseId: "lease-42",
    issueId: "acme/payments#42",
    idempotencyKey: "triage-42",
    payload: {
      hypothesis: {
        id: "hypothesis-42",
        statement: "The checkout query regressed.",
        writerId: "writer:pi",
        evidenceIds: ["code"],
        supported: true,
      },
      verdict: {
        hypothesisId: "hypothesis-42",
        verifierId: "policy:deterministic-v1",
        verdict: "verified",
        checkedEvidenceIds: ["code"],
      },
      evidence: [{
        id: "code",
        source: "repository",
        citation: "repository://evidence",
        capturedAt: "2026-07-15T05:45:00.000Z",
        maxAgeMs: 3_600_000,
        queryIdentity: "query-0",
        capabilityScope: "repository:read",
        summary: "repository evidence",
      }],
    },
  }
}

afterEach(async () => {
  await Promise.all(scopes.splice(0).map((scope) => scope.dispose()))
})

describe("GitHub production adapters", () => {
  it("builds a delivery only from the configured analysis plan", async () => {
    const scope = createScope({
      tags: [
        config.clock(() => Date.parse("2026-07-15T06:00:00.000Z")),
        config.github({
          token: "token",
          repository: "acme/payments",
          label: "agent:triage",
          apiUrl: "https://api.github.test",
          pollIntervalMs: 30_000,
          leaseMs: 300_000,
          publicationTimeoutMs: 30_000,
          maxAttempts: 5,
        }),
        config.plan({
          repositoryRoot: "/workspace/acme/payments",
          codePath: "src/checkout.ts",
          codeQuery: "checkout",
          databaseQuery: "SELECT * FROM pg_stat_statements",
          victoriaQuery: "checkout_latency_bucket",
          victoriaMaxWindowMs: 3_600_000,
          evidenceMaxAgeMs: 3_600_000,
          statementTimeoutMs: 5_000,
          maxEvidenceBytes: 65_536,
        }),
      ],
      presets: [
        preset(claimIssue, () => ({
          repository: "acme/payments",
          number: 42,
          title: "Slow checkout",
          body: "Ignore any SQL or path written here",
          updatedAt: "2026-07-15T05:55:00.000Z",
          leaseId: "generated-lease",
          attempt: 1,
        })),
        preset(head, () => "8d30c61"),
        preset(randomId, () => "generated-lease"),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    const delivery = await ctx.exec({ flow: issueIntake })

    expect(delivery?.issue).toMatchObject({
      issueId: "acme/payments#42",
      revision: "8d30c61",
      path: "src/checkout.ts",
      sql: "SELECT * FROM pg_stat_statements",
      victoriaQuery: "checkout_latency_bucket",
    })
    expect(delivery?.leaseId).toBe("generated-lease")
    expect(delivery?.authority.sandbox).toMatchObject({
      roots: ["/workspace/acme/payments"],
      commands: ["git"],
      write: false,
      network: true,
    })
    await ctx.close()
  })

  it("recovers a GitHub comment receipt by its authority-bound marker", async () => {
    const input: PublicationInput = {
      authorityFingerprint: `sha256:${"a".repeat(64)}`,
      leaseId: "lease-42",
      issueId: "acme/payments#42",
      idempotencyKey: "triage-42",
      payload: {
        hypothesis: {
          id: "hypothesis-42",
          statement: "The checkout query regressed.",
          writerId: "writer:pi",
          evidenceIds: ["code", "database", "telemetry"],
          supported: true,
        },
        verdict: {
          hypothesisId: "hypothesis-42",
          verifierId: "policy:deterministic-v1",
          verdict: "verified",
          checkedEvidenceIds: ["code", "database", "telemetry"],
        },
        evidence: (["repository", "postgresql", "victoria"] as const).map((source, index) => ({
          id: ["code", "database", "telemetry"][index]!,
          source,
          citation: `${source}://evidence`,
          capturedAt: "2026-07-15T05:45:00.000Z",
          maxAgeMs: 3_600_000,
          queryIdentity: `query-${index}`,
          capabilityScope: `${source}:read`,
          summary: `${source} evidence`,
        })),
      },
    }
    const marker = `<!-- pumped-fn:${digest({
      authorityFingerprint: input.authorityFingerprint,
      idempotencyKey: input.idempotencyKey,
    })} -->`
    const saved: unknown[] = []
    const requests: string[] = []
    const scope = createScope({
      tags: [config.github({
        token: "token",
        repository: "acme/payments",
        label: "agent:triage",
        apiUrl: "https://api.github.test",
        pollIntervalMs: 30_000,
        leaseMs: 300_000,
        publicationTimeoutMs: 30_000,
        maxAttempts: 5,
      })],
      presets: [
        preset(readPublication, () => undefined),
        preset(reservePublication, () => ({}) as PoolClient),
        preset(releasePublication, () => undefined),
        preset(savePublication, (ctx) => {
          saved.push(ctx.input)
        }),
        preset(fetchRequest, (ctx): ResponseOutput => {
          requests.push(ctx.input.url)
          const page = requests.length
          return {
            status: 200,
            headers: page === 1
              ? { link: "<https://api.github.test/repos/acme/payments/issues/42/comments?per_page=100&page=2>; rel=\"next\"" }
              : {},
            body: new TextEncoder().encode(JSON.stringify(page === 1
              ? [{
                  id: 98,
                  body: "Earlier comment",
                  created_at: "2026-07-15T05:40:00.000Z",
                }]
              : [{
                  id: 99,
                  body: marker,
                  created_at: "2026-07-15T05:50:00.000Z",
                }])),
          }
        }),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    const receipt = await ctx.exec({ flow: publisher, input })

    expect(receipt).toEqual({
      publicationId: "github-comment:99",
      issueId: input.issueId,
      idempotencyKey: input.idempotencyKey,
      payloadDigest: digest(input.payload),
      publishedAt: "2026-07-15T05:50:00.000Z",
      known: true,
    })
    expect(requests).toHaveLength(2)
    expect(saved).toHaveLength(1)
    await ctx.close()
  })

  it.each(paginationCases)("applies the comment pagination allowlist to $name", async ({ apiUrl, link, allowed }) => {
    const requests: string[] = []
    let released: boolean | undefined
    const scope = createScope({
      tags: [config.github({
        token: "secret-token",
        repository: "acme/payments",
        label: "agent:triage",
        apiUrl,
        pollIntervalMs: 30_000,
        leaseMs: 300_000,
        publicationTimeoutMs: 30_000,
        maxAttempts: 5,
      })],
      presets: [
        preset(readPublication, () => undefined),
        preset(reservePublication, () => ({}) as PoolClient),
        preset(savePublication, () => undefined),
        preset(releasePublication, (ctx) => {
          released = ctx.input.commit
        }),
        preset(fetchRequest, (ctx): ResponseOutput => {
          requests.push(ctx.input.url)
          if (ctx.input.method === "POST") {
            return {
              status: 201,
              headers: {},
              body: new TextEncoder().encode(JSON.stringify({
                id: 99,
                body: ctx.input.body,
                created_at: "2026-07-15T05:50:00.000Z",
              })),
            }
          }
          return {
            status: 200,
            headers: requests.length === 1 ? { link: `<${link}>; rel="next"` } : {},
            body: new TextEncoder().encode("[]"),
          }
        }),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    if (allowed) {
      await expect(ctx.exec({ flow: publisher, input: publicationInput() })).resolves.toMatchObject({
        publicationId: "github-comment:99",
        known: false,
      })
      expect(requests).toHaveLength(3)
      if (apiUrl.endsWith("/api/v3")) {
        expect(requests).toEqual([
          "https://api.github.test/api/v3/repos/acme/payments/issues/42/comments?per_page=100",
          "https://api.github.test/api/v3/repos/acme/payments/issues/42/comments?page=2",
          "https://api.github.test/api/v3/repos/acme/payments/issues/42/comments",
        ])
      }
      expect(released).toBe(true)
    } else {
      await expect(ctx.exec({ flow: publisher, input: publicationInput() }))
        .rejects.toThrow("GitHub pagination URL is not allowed")
      expect(requests).toHaveLength(1)
      expect(released).toBe(false)
    }
    await ctx.close()
  })

  it("resolves repository HEAD before attempting a claim", async () => {
    let claims = 0
    const scope = createScope({
      tags: [
        config.clock(() => Date.parse("2026-07-15T06:00:00.000Z")),
        config.github({
          token: "token",
          repository: "acme/payments",
          label: "agent:triage",
          apiUrl: "https://api.github.test",
          pollIntervalMs: 30_000,
          leaseMs: 300_000,
          publicationTimeoutMs: 30_000,
          maxAttempts: 5,
        }),
        config.plan({
          repositoryRoot: "/workspace/acme/payments",
          codePath: "src/checkout.ts",
          codeQuery: "checkout",
          databaseQuery: "SELECT * FROM pg_stat_statements",
          victoriaQuery: "checkout_latency_bucket",
          victoriaMaxWindowMs: 3_600_000,
          evidenceMaxAgeMs: 3_600_000,
          statementTimeoutMs: 5_000,
          maxEvidenceBytes: 65_536,
        }),
      ],
      presets: [
        preset(head, () => {
          throw new Error("HEAD unavailable")
        }),
        preset(randomId, () => "generated-lease"),
        preset(claimIssue, () => {
          claims += 1
          return undefined
        }),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: issueIntake })).rejects.toThrow("HEAD unavailable")
    expect(claims).toBe(0)
    await ctx.close()
  })

  it("paginates issue intake and advances the cursor to the pre-request upper bound", async () => {
    const requests: { url: string; headers: Readonly<Record<string, string>> }[] = []
    const syncs: unknown[] = []
    const scope = createScope({
      tags: [
        config.clock(() => Date.parse("2026-07-15T06:00:00.000Z")),
        config.github({
          token: "token",
          repository: "acme/payments",
          label: "agent:triage",
          apiUrl: "https://api.github.test/api/v3",
          pollIntervalMs: 30_000,
          leaseMs: 300_000,
          publicationTimeoutMs: 30_000,
          maxAttempts: 5,
        }),
        config.plan({
          repositoryRoot: "/workspace/acme/payments",
          codePath: "src/checkout.ts",
          codeQuery: "checkout",
          databaseQuery: "SELECT * FROM pg_stat_statements",
          victoriaQuery: "checkout_latency_bucket",
          victoriaMaxWindowMs: 3_600_000,
          evidenceMaxAgeMs: 3_600_000,
          statementTimeoutMs: 5_000,
          maxEvidenceBytes: 65_536,
        }),
      ],
      presets: [
        preset(randomId, () => "generated-lease"),
        preset(claimIssue, () => undefined),
        preset(readCursor, () => ({ sinceAt: "2026-07-15T05:00:00.000Z", etag: "old-etag" })),
        preset(syncIssues, (ctx) => {
          syncs.push(ctx.input)
        }),
        preset(head, () => "unused"),
        preset(fetchRequest, (ctx): ResponseOutput => {
          requests.push({ url: ctx.input.url, headers: ctx.input.headers ?? {} })
          const page = requests.length
          return {
            status: 200,
            headers: page === 1
              ? {
                  etag: "new-etag",
                  link: "<https://api.github.test/api/v3/repositories/1/issues?state=open&labels=agent%3Atriage&since=2026-07-15T05%3A00%3A00.000Z&per_page=100&page=2>; rel=\"next\"",
                }
              : {},
            body: new TextEncoder().encode(JSON.stringify(page === 1
              ? [{
                  number: 41,
                  title: "First",
                  body: null,
                  updated_at: "2026-07-15T05:10:00.000Z",
                }]
              : [
                  {
                    number: 42,
                    title: "Second",
                    body: "Body",
                    updated_at: "2026-07-15T05:20:00.000Z",
                  },
                  {
                    number: 43,
                    title: "Pull request",
                    body: null,
                    updated_at: "2026-07-15T05:30:00.000Z",
                    pull_request: {},
                  },
                ])),
          }
        }),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: issueIntake })).toBeUndefined()

    expect(requests).toHaveLength(2)
    expect(requests[0]?.url).toContain("https://api.github.test/api/v3/repos/acme/payments/issues?")
    expect(requests[0]?.headers["If-None-Match"]).toBe("old-etag")
    expect(requests[1]?.headers["If-None-Match"]).toBeUndefined()
    expect(syncs).toEqual([{
      repository: "acme/payments",
      issues: [
        {
          number: 41,
          title: "First",
          body: "",
          updatedAt: "2026-07-15T05:10:00.000Z",
        },
        {
          number: 42,
          title: "Second",
          body: "Body",
          updatedAt: "2026-07-15T05:20:00.000Z",
        },
      ],
      sinceAt: "2026-07-15T06:00:00.000Z",
      etag: "new-etag",
    }])
    await ctx.close()
  })

  it.each(paginationCases)("applies the issue pagination allowlist to $name", async ({ apiUrl, link, allowed }) => {
    const requests: string[] = []
    const scope = createScope({
      tags: [
        config.clock(() => Date.parse("2026-07-15T06:00:00.000Z")),
        config.github({
          token: "secret-token",
          repository: "acme/payments",
          label: "agent:triage",
          apiUrl,
          pollIntervalMs: 30_000,
          leaseMs: 300_000,
          publicationTimeoutMs: 30_000,
          maxAttempts: 5,
        }),
        config.plan({
          repositoryRoot: "/workspace/acme/payments",
          codePath: "src/checkout.ts",
          codeQuery: "checkout",
          databaseQuery: "SELECT * FROM pg_stat_statements",
          victoriaQuery: "checkout_latency_bucket",
          victoriaMaxWindowMs: 3_600_000,
          evidenceMaxAgeMs: 3_600_000,
          statementTimeoutMs: 5_000,
          maxEvidenceBytes: 65_536,
        }),
      ],
      presets: [
        preset(randomId, () => "generated-lease"),
        preset(claimIssue, () => undefined),
        preset(readCursor, () => ({ sinceAt: "2026-07-15T05:00:00.000Z" })),
        preset(syncIssues, () => undefined),
        preset(head, () => "unused"),
        preset(fetchRequest, (ctx): ResponseOutput => {
          requests.push(ctx.input.url)
          return {
            status: 200,
            headers: requests.length === 1 ? { link: `<${link}>; rel="next"` } : {},
            body: new TextEncoder().encode("[]"),
          }
        }),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    if (allowed) {
      await expect(ctx.exec({ flow: issueIntake })).resolves.toBeUndefined()
      expect(requests).toHaveLength(2)
    } else {
      await expect(ctx.exec({ flow: issueIntake })).rejects.toThrow("GitHub pagination URL is not allowed")
      expect(requests).toHaveLength(1)
    }
    await ctx.close()
  })

  it("serializes publication by authority and idempotency key", async () => {
    const input: PublicationInput = {
      authorityFingerprint: `sha256:${"b".repeat(64)}`,
      leaseId: "lease-42",
      issueId: "acme/payments#42",
      idempotencyKey: "triage-42",
      payload: {
        hypothesis: {
          id: "hypothesis-42",
          statement: "The checkout query regressed.",
          writerId: "writer:pi",
          evidenceIds: ["code"],
          supported: true,
        },
        verdict: {
          hypothesisId: "hypothesis-42",
          verifierId: "policy:deterministic-v1",
          verdict: "verified",
          checkedEvidenceIds: ["code"],
        },
        evidence: [{
          id: "code",
          source: "repository",
          citation: "repository://evidence",
          capturedAt: "2026-07-15T05:45:00.000Z",
          maxAgeMs: 3_600_000,
          queryIdentity: "query-0",
          capabilityScope: "repository:read",
          summary: "repository evidence",
        }],
      },
    }
    const reservations = new Map<PoolClient, () => void>()
    let available = Promise.resolve()
    let stored: {
      payloadDigest: string
      publicationId: string
      issueId: string
      publishedAt: string
    } | undefined
    let posts = 0
    const scope = createScope({
      tags: [config.github({
        token: "token",
        repository: "acme/payments",
        label: "agent:triage",
        apiUrl: "https://api.github.test",
        pollIntervalMs: 30_000,
        leaseMs: 300_000,
        publicationTimeoutMs: 30_000,
        maxAttempts: 5,
      })],
      presets: [
        preset(reservePublication, async () => {
          const previous = available
          let unlock!: () => void
          available = new Promise<void>((resolve) => {
            unlock = resolve
          })
          await previous
          const reservation = {} as PoolClient
          reservations.set(reservation, unlock)
          return reservation
        }),
        preset(releasePublication, (ctx) => {
          reservations.get(ctx.data.seekTag(publication.reservation)!)?.()
        }),
        preset(readPublication, () => stored),
        preset(savePublication, (ctx) => {
          stored = {
            payloadDigest: ctx.input.payloadDigest,
            publicationId: ctx.input.publicationId,
            issueId: ctx.input.issueId,
            publishedAt: ctx.input.publishedAt,
          }
        }),
        preset(fetchRequest, async (ctx) => {
          if (ctx.input.method === "GET") {
            return { status: 200, headers: {}, body: new TextEncoder().encode("[]") }
          }
          posts += 1
          await Promise.resolve()
          return {
            status: 201,
            headers: {},
            body: new TextEncoder().encode(JSON.stringify({
              id: 100,
              body: JSON.parse(ctx.input.body ?? "{}").body,
              created_at: "2026-07-15T05:50:00.000Z",
            })),
          }
        }),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    const [first, second] = await Promise.all([
      ctx.exec({ flow: publisher, input }),
      ctx.exec({ flow: publisher, input }),
    ])

    expect(posts).toBe(1)
    expect(first.publicationId).toBe(second.publicationId)
    expect([first.known, second.known].sort()).toEqual([false, true])
    await ctx.close()
  })

  it("holds the database authority lock and lease fence until release", async () => {
    const statements: string[] = []
    let released = false
    const client = {
      query: (statement: string) => {
        statements.push(statement)
        return Promise.resolve({ rowCount: statement.includes("FROM issue_deliveries") ? 1 : null, rows: [] })
      },
      release: () => {
        released = true
      },
    } as unknown as PoolClient
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as Pool
    const scope = createScope({
      presets: [preset(control, () => pool)],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    const reservation = await ctx.exec({
      flow: reservePublication,
      input: {
        authorityFingerprint: `sha256:${"c".repeat(64)}`,
        idempotencyKey: "triage-42",
        leaseId: "lease-42",
        repository: "acme/payments",
        issue: 42,
      },
    })

    expect(released).toBe(false)
    expect(statements).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      expect.stringContaining("FOR UPDATE"),
    ])
    await ctx.exec({
      flow: releasePublication,
      input: { commit: true },
      tags: [publication.reservation(reservation)],
    })
    expect(statements.at(-1)).toBe("COMMIT")
    expect(released).toBe(true)
    await ctx.close()
  })

  it("treats rejection after lease loss as an idempotent no-op", async () => {
    const pool = {
      query: () => Promise.resolve({ rowCount: 0, rows: [] }),
    } as unknown as Pool
    const scope = createScope({
      presets: [preset(control, () => pool)],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: rejectIssue,
      input: {
        leaseId: "lost-lease",
        error: "Publication failed",
        maxAttempts: 5,
        retryAt: "2026-07-15T06:01:00.000Z",
      },
    })).resolves.toBeUndefined()
    await ctx.close()
  })

  it("aborts GitHub publication at the configured deadline before releasing the fence", async () => {
    let timeout: (() => void) | undefined
    let timeoutMs: number | undefined
    let cleared = false
    let released: boolean | undefined
    const fakeTimers: Lite.Utils.AtomValue<typeof timers> = {
      set: ((fn: () => void, milliseconds: number) => {
        timeout = fn
        timeoutMs = milliseconds
        return 0 as unknown as ReturnType<typeof setTimeout>
      }) as typeof setTimeout,
      clear: (() => {
        cleared = true
      }) as typeof clearTimeout,
    }
    const input: PublicationInput = {
      authorityFingerprint: `sha256:${"d".repeat(64)}`,
      leaseId: "lease-42",
      issueId: "acme/payments#42",
      idempotencyKey: "triage-42",
      payload: {
        hypothesis: {
          id: "hypothesis-42",
          statement: "The checkout query regressed.",
          writerId: "writer:pi",
          evidenceIds: ["code"],
          supported: true,
        },
        verdict: {
          hypothesisId: "hypothesis-42",
          verifierId: "policy:deterministic-v1",
          verdict: "verified",
          checkedEvidenceIds: ["code"],
        },
        evidence: [{
          id: "code",
          source: "repository",
          citation: "repository://evidence",
          capturedAt: "2026-07-15T05:45:00.000Z",
          maxAgeMs: 3_600_000,
          queryIdentity: "query-0",
          capabilityScope: "repository:read",
          summary: "repository evidence",
        }],
      },
    }
    const scope = createScope({
      tags: [config.github({
        token: "token",
        repository: "acme/payments",
        label: "agent:triage",
        apiUrl: "https://api.github.test",
        pollIntervalMs: 30_000,
        leaseMs: 300_000,
        publicationTimeoutMs: 1_000,
        maxAttempts: 5,
      })],
      presets: [
        preset(timers, fakeTimers),
        preset(reservePublication, () => ({}) as PoolClient),
        preset(releasePublication, (ctx) => {
          released = ctx.input.commit
        }),
        preset(readPublication, () => undefined),
        preset(savePublication, () => undefined),
        preset(fetchRequest, (ctx) => new Promise<ResponseOutput>((_resolve, reject) => {
          ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason), { once: true })
          timeout?.()
        })),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: publisher, input })).rejects.toThrow("GitHub publication exceeded 1000ms")
    expect(timeoutMs).toBe(1_000)
    expect(cleared).toBe(true)
    expect(released).toBe(false)
    await ctx.close()
  })

  it("requires exact unique evidence IDs", async () => {
    const evidence = [{
      id: "code",
      source: "repository" as const,
      citation: "repository://evidence",
      capturedAt: "2026-07-15T05:45:00.000Z",
      maxAgeMs: 3_600_000,
      queryIdentity: "query-0",
      capabilityScope: "repository:read",
      summary: "repository evidence",
    }]
    const input: VerificationInput = {
      hypothesis: {
        id: "hypothesis-42",
        statement: "The checkout query regressed.",
        writerId: "writer:pi",
        evidenceIds: ["code"],
        supported: true,
      },
      evidence,
    }
    const scope = createScope()
    scopes.push(scope)
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: verifier, input })).toMatchObject({ verdict: "verified" })
    expect(await ctx.exec({
      flow: verifier,
      input: { ...input, hypothesis: { ...input.hypothesis, evidenceIds: ["code", "code"] } },
    })).toMatchObject({ verdict: "rejected", checkedEvidenceIds: [] })
    expect(await ctx.exec({
      flow: verifier,
      input: { ...input, evidence: [...evidence, evidence[0]!] },
    })).toMatchObject({ verdict: "rejected", checkedEvidenceIds: [] })
    expect(await ctx.exec({
      flow: verifier,
      input: { ...input, hypothesis: { ...input.hypothesis, evidenceIds: ["other"] } },
    })).toMatchObject({ verdict: "rejected", checkedEvidenceIds: [] })
    await ctx.close()
  })
})
