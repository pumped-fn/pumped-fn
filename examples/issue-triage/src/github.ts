import { controller, flow, tags, typed } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import { z } from "zod"
import { config } from "./config.js"
import {
  acknowledgeIssue,
  claimIssue,
  issueLeaseValid,
  publication,
  readCursor,
  readPublication,
  rejectIssue,
  releasePublication,
  reservePublication,
  savePublication,
  syncIssues,
} from "./database.js"
import { fetchRequest } from "./http.js"
import { head } from "./repository.js"
import { timers } from "./runtime.js"
import { authority, initial } from "./session.js"
import {
  digest,
  ports,
  TriageError,
  type DeliveryLease,
  type PublicationInput,
  type PublicationReceipt,
  type VerificationInput,
  type VerifierVerdict,
} from "./triage.js"

const issueShape = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  updated_at: z.string().datetime(),
  pull_request: z.unknown().optional(),
}).passthrough()
const commentShape = z.object({
  id: z.number().int().positive(),
  body: z.string().nullable(),
  created_at: z.string().datetime(),
}).passthrough()

function githubUrl(apiUrl: string, path: string): URL {
  const base = new URL(apiUrl)
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/`
  base.search = ""
  base.hash = ""
  return new URL(path.replace(/^\/+/, ""), base)
}

function assertGitHubPage(url: URL, apiUrl: string): void {
  const allowed = new URL(apiUrl)
  if ((allowed.protocol !== "http:" && allowed.protocol !== "https:")
    || allowed.username !== ""
    || allowed.password !== ""
    || url.protocol !== allowed.protocol
    || url.origin !== allowed.origin
    || url.username !== ""
    || url.password !== "") {
    throw new TriageError("authorize", url.href, "GitHub pagination URL is not allowed")
  }
}

export const randomId = flow({
  name: "issue-triage.runtime.random-id",
  factory: () => crypto.randomUUID(),
})

const listIssues = flow({
  name: "issue-triage.github.list-issues",
  parse: typed<{ sinceAt: string; etag?: string }>(),
  deps: {
    github: tags.required(config.github),
    request: controller(fetchRequest),
  },
  tags: [step({ workflow: true, kind: "http" })],
  factory: async (ctx, { github, request }) => {
    let url: URL | undefined = githubUrl(github.apiUrl, `repos/${github.repository}/issues`)
    url.searchParams.set("state", "open")
    url.searchParams.set("labels", github.label)
    url.searchParams.set("since", ctx.input.sinceAt)
    url.searchParams.set("per_page", "100")
    const issues: z.infer<typeof issueShape>[] = []
    let etag: string | undefined
    let first = true
    while (url) {
      assertGitHubPage(url, github.apiUrl)
      const response = await request.exec({
        input: {
          url: url.href,
          method: "GET",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${github.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(first && ctx.input.etag !== undefined ? { "If-None-Match": ctx.input.etag } : {}),
          },
        },
      })
      if (response.status === 304) return { issues: [], etag: ctx.input.etag }
      if (response.status < 200 || response.status >= 300) {
        throw new TriageError("lease", github.repository, `GitHub issue listing returned HTTP ${response.status}`)
      }
      if (first) etag = response.headers["etag"]
      issues.push(...z.array(issueShape).parse(JSON.parse(new TextDecoder().decode(response.body))))
      const next = response.headers["link"]?.split(",")
        .map((value) => /^\s*<([^>]+)>;\s*rel="([^"]+)"\s*$/.exec(value))
        .find((value) => value?.[2] === "next")?.[1]
      url = next === undefined ? undefined : new URL(next, url)
      first = false
    }
    return {
      issues: issues
        .filter((issue) => issue.pull_request === undefined)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          body: issue.body ?? "",
          updatedAt: issue.updated_at,
        })),
      etag,
    }
  },
})

const poll = flow({
  name: "issue-triage.github.poll",
  deps: {
    github: tags.required(config.github),
    clock: tags.required(config.clock),
    cursor: controller(readCursor),
    list: controller(listIssues),
    sync: controller(syncIssues),
  },
  factory: async (_ctx, { github, clock, cursor, list, sync }) => {
    const previous = await cursor.exec({ input: { repository: github.repository } })
    const upperBound = new Date(clock()).toISOString()
    const response = await list.exec({ input: previous })
    await sync.exec({
      input: {
        repository: github.repository,
        issues: response.issues,
        sinceAt: upperBound,
        ...(response.etag === undefined ? {} : { etag: response.etag }),
      },
    })
  },
})

export const issueIntake = flow({
  name: "issue-triage.github.issue-intake",
  deps: {
    github: tags.required(config.github),
    plan: tags.required(config.plan),
    clock: tags.required(config.clock),
    claim: controller(claimIssue),
    poll: controller(poll),
    head: controller(head),
    randomId: controller(randomId),
  },
  factory: async (_ctx, { github, plan, clock, claim, poll, head, randomId }): Promise<DeliveryLease | undefined> => {
    const revision = await head.exec()
    const leaseId = await randomId.exec()
    let claimed = await claim.exec({
      input: {
        repository: github.repository,
        leaseId,
        leaseMs: github.leaseMs,
        maxAttempts: github.maxAttempts,
      },
    })
    if (!claimed) {
      await poll.exec()
      claimed = await claim.exec({
        input: {
          repository: github.repository,
          leaseId,
          leaseMs: github.leaseMs,
          maxAttempts: github.maxAttempts,
        },
      })
    }
    if (!claimed) return undefined
    const windowEnd = clock()
    const bound = authority(github.repository, plan.repositoryRoot)
    return {
      leaseId: claimed.leaseId,
      issue: {
        issueId: `${github.repository}#${claimed.number}`,
        repository: github.repository,
        title: claimed.title,
        body: claimed.body,
        revision,
        path: plan.codePath,
        sql: plan.databaseQuery,
        victoriaQuery: plan.victoriaQuery,
        windowStart: new Date(windowEnd - plan.victoriaMaxWindowMs).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
        idempotencyKey: digest({
          repository: github.repository,
          issue: claimed.number,
          updatedAt: claimed.updatedAt,
          revision,
        }),
      },
      authority: bound,
      record: initial(
        `github:${github.repository}#${claimed.number}:${claimed.attempt}:${digest(claimed.updatedAt)}`,
        bound,
      ),
    }
  },
})

export const acknowledge = flow({
  name: "issue-triage.github.acknowledge",
  parse: typed<{ leaseId: string; receipt: PublicationReceipt }>(),
  deps: { acknowledge: controller(acknowledgeIssue) },
  factory: (ctx, { acknowledge }) => acknowledge.exec({ input: ctx.input }),
})

export const reject = flow({
  name: "issue-triage.github.reject",
  parse: typed<{ leaseId: string; error: unknown }>(),
  deps: {
    github: tags.required(config.github),
    clock: tags.required(config.clock),
    reject: controller(rejectIssue),
  },
  factory: (ctx, { github, clock, reject }) => reject.exec({
    input: {
      leaseId: ctx.input.leaseId,
      error: ctx.input.error instanceof Error ? ctx.input.error.message : String(ctx.input.error),
      maxAttempts: github.maxAttempts,
      retryAt: new Date(clock() + Math.min(github.pollIntervalMs * 8, github.leaseMs)).toISOString(),
    },
  }),
})

export const leaseValid = flow({
  name: "issue-triage.github.lease-valid",
  parse: typed<{ leaseId: string }>(),
  deps: { valid: controller(issueLeaseValid) },
  factory: (ctx, { valid }) => valid.exec({ input: ctx.input }),
})

export const wait = flow({
  name: "issue-triage.wait",
  parse: typed<{ milliseconds: number }>(),
  deps: { timers },
  factory: (ctx, { timers }) => new Promise<void>((resolve, reject) => {
    const timer = timers.set(resolve, ctx.input.milliseconds)
    ctx.signal.addEventListener("abort", () => {
      timers.clear(timer)
      reject(ctx.signal.reason)
    }, { once: true })
  }),
})

const listComments = flow({
  name: "issue-triage.github.list-comments",
  parse: typed<{ issue: number }>(),
  deps: {
    github: tags.required(config.github),
    request: controller(fetchRequest),
  },
  tags: [step({ workflow: true, kind: "http" })],
  factory: async (ctx, { github, request }) => {
    let url: URL | undefined = githubUrl(github.apiUrl, `repos/${github.repository}/issues/${ctx.input.issue}/comments?per_page=100`)
    const comments: z.infer<typeof commentShape>[] = []
    while (url) {
      assertGitHubPage(url, github.apiUrl)
      const response = await request.exec({
        input: {
          url: url.href,
          method: "GET",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${github.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      })
      if (response.status < 200 || response.status >= 300) {
        throw new TriageError("publish", `${github.repository}#${ctx.input.issue}`, `GitHub comment listing returned HTTP ${response.status}`)
      }
      comments.push(...z.array(commentShape).parse(JSON.parse(new TextDecoder().decode(response.body))))
      const next = response.headers["link"]?.split(",")
        .map((value) => /^\s*<([^>]+)>;\s*rel="([^"]+)"\s*$/.exec(value))
        .find((value) => value?.[2] === "next")?.[1]
      url = next === undefined ? undefined : new URL(next, url)
    }
    return comments
  },
})

const createComment = flow({
  name: "issue-triage.github.create-comment",
  parse: typed<{ issue: number; body: string }>(),
  deps: {
    github: tags.required(config.github),
    request: controller(fetchRequest),
  },
  tags: [step({ workflow: true, kind: "http" })],
  factory: async (ctx, { github, request }) => {
    const response = await request.exec({
      input: {
        url: githubUrl(github.apiUrl, `repos/${github.repository}/issues/${ctx.input.issue}/comments`).href,
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${github.token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ body: ctx.input.body }),
      },
    })
    if (response.status < 200 || response.status >= 300) {
      throw new TriageError("publish", `${github.repository}#${ctx.input.issue}`, `GitHub comment creation returned HTTP ${response.status}`)
    }
    return commentShape.parse(JSON.parse(new TextDecoder().decode(response.body)))
  },
})

export const verifier = flow({
  name: "issue-triage.policy.verify",
  parse: typed<VerificationInput>(),
  factory: (ctx): VerifierVerdict => {
    const evidenceIds = ctx.input.evidence.map((item) => item.id)
    const citedIds = ctx.input.hypothesis.evidenceIds
    const evidence = new Set(evidenceIds)
    const citations = new Set(citedIds)
    const complete = ctx.input.hypothesis.supported
      && evidence.size === evidenceIds.length
      && citations.size === citedIds.length
      && evidence.size === citations.size
      && citedIds.every((id) => evidence.has(id))
    return {
      hypothesisId: ctx.input.hypothesis.id,
      verifierId: "policy:deterministic-v1",
      verdict: complete ? "verified" : "rejected",
      checkedEvidenceIds: complete ? [...citations] : [],
    }
  },
})

export const publisher = flow({
  name: "issue-triage.github.publish",
  parse: typed<PublicationInput>(),
  deps: {
    read: controller(readPublication),
    save: controller(savePublication),
    comments: controller(listComments),
    comment: controller(createComment),
    reserve: controller(reservePublication),
    release: controller(releasePublication),
    github: tags.required(config.github),
    timers,
  },
  factory: async (ctx, { read, save, comments, comment, reserve, release, github, timers }): Promise<PublicationReceipt> => {
    const payloadDigest = digest(ctx.input.payload)
    const separator = ctx.input.issueId.lastIndexOf("#")
    const issueText = ctx.input.issueId.slice(separator + 1)
    const issue = Number(issueText)
    if (separator < 1 || !/^[1-9]\d*$/.test(issueText) || !Number.isSafeInteger(issue)) {
      throw new TriageError("publish", ctx.input.issueId, "Publication issue id is invalid")
    }
    const repository = ctx.input.issueId.slice(0, separator)
    const reservation = await reserve.exec({
      input: {
        authorityFingerprint: ctx.input.authorityFingerprint,
        idempotencyKey: ctx.input.idempotencyKey,
        leaseId: ctx.input.leaseId,
        repository,
        issue,
      },
    })
    let commit = false
    const deadline = new AbortController()
    const abort = () => deadline.abort(ctx.signal.reason)
    if (ctx.signal.aborted) abort()
    else ctx.signal.addEventListener("abort", abort, { once: true })
    const timer = timers.set(
      () => deadline.abort(new TriageError("publish", ctx.input.issueId, `GitHub publication exceeded ${github.publicationTimeoutMs}ms`)),
      github.publicationTimeoutMs,
    )
    try {
      const stored = await read.exec({
        input: {
          authorityFingerprint: ctx.input.authorityFingerprint,
          idempotencyKey: ctx.input.idempotencyKey,
        },
        tags: [publication.reservation(reservation)],
      })
      if (stored) {
        if (stored.payloadDigest !== payloadDigest) throw new TriageError("publish", ctx.input.idempotencyKey, "Publication key conflicts with another payload")
        commit = true
        return { ...stored, idempotencyKey: ctx.input.idempotencyKey, known: true }
      }
      const marker = `<!-- pumped-fn:${digest({
        authorityFingerprint: ctx.input.authorityFingerprint,
        idempotencyKey: ctx.input.idempotencyKey,
      })} -->`
      const known = (await comments.exec({ input: { issue }, signal: deadline.signal })).find((value) => value.body?.includes(marker))
      const created = known ?? await comment.exec({
        input: {
          issue,
          body: [
            marker,
            "### Pumped-fn triage",
            ctx.input.payload.hypothesis.statement,
            "",
            ...ctx.input.payload.evidence.map((item) => `- ${item.source}: ${item.citation}`),
          ].join("\n"),
        },
        signal: deadline.signal,
      })
      const receipt = {
        publicationId: `github-comment:${created.id}`,
        issueId: ctx.input.issueId,
        idempotencyKey: ctx.input.idempotencyKey,
        payloadDigest,
        publishedAt: created.created_at,
        known: known !== undefined,
      }
      await save.exec({
        input: {
          authorityFingerprint: ctx.input.authorityFingerprint,
          idempotencyKey: ctx.input.idempotencyKey,
          payloadDigest,
          publicationId: receipt.publicationId,
          issueId: receipt.issueId,
          publishedAt: receipt.publishedAt,
        },
        tags: [publication.reservation(reservation)],
      })
      commit = true
      return receipt
    } finally {
      timers.clear(timer)
      ctx.signal.removeEventListener("abort", abort)
      await release.exec({
        input: { commit },
        tags: [publication.reservation(reservation)],
      })
    }
  },
})

export const githubBindings = Object.freeze([
  ports.issueIntake(issueIntake),
  ports.acknowledge(acknowledge),
  ports.reject(reject),
  ports.leaseValid(leaseValid),
  ports.wait(wait),
  ports.verifier(verifier),
  ports.publisher(publisher),
])
