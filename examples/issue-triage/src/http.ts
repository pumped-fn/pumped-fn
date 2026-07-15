import { flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import * as session from "@pumped-fn/sdk/session"
import { TriageError } from "./triage.js"

export interface RequestInput {
  readonly url: string
  readonly method: "GET" | "POST"
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
}

export interface ResponseOutput {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: Uint8Array
}

export interface Policy {
  readonly origins: readonly string[]
  readonly maxResponseBytes: number
}

type Request = Lite.Flow<ResponseOutput, RequestInput>

const policy = tag<Policy>({ label: "issue-triage.http.policy" })
const impl = {
  request: tag<Request>({ label: "issue-triage.http.impl.request" }),
}

const request: Request = flow({
  name: "issue-triage.http.request",
  parse: typed<RequestInput>(),
  deps: {
    runtime: session.session,
    policy: tags.required(policy),
    request: tags.required(impl.request),
  },
  tags: [step({ workflow: true, kind: "http" })],
  factory: (ctx, { runtime, policy, request }) => {
    const url = new URL(ctx.input.url)
    if (!runtime.authority.sandbox.network) throw new TriageError("authorize", ctx.input.url, "Session authority denies network access")
    if (!policy.origins.includes(url.origin)) throw new TriageError("authorize", ctx.input.url, `HTTP origin ${url.origin} is not allowed`)
    if (!Number.isSafeInteger(policy.maxResponseBytes) || policy.maxResponseBytes < 1) {
      throw new TriageError("authorize", ctx.input.url, "HTTP response limit must be a positive safe integer")
    }
    return request.exec({ input: ctx.input })
  },
})

export const fetchRequest: Request = flow({
  name: "issue-triage.http.fetch",
  parse: typed<RequestInput>(),
  deps: { policy: tags.required(policy) },
  tags: [step({ workflow: true, kind: "http" })],
  factory: async (ctx, { policy }): Promise<ResponseOutput> => {
    const response = await fetch(ctx.input.url, {
      method: ctx.input.method,
      headers: ctx.input.headers,
      body: ctx.input.body,
      signal: ctx.signal,
    })
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        if (size > policy.maxResponseBytes) {
          await reader.cancel()
          throw new TriageError("evidence", ctx.input.url, `HTTP response exceeded ${policy.maxResponseBytes} bytes`)
        }
        chunks.push(next.value)
      }
    }
    const body = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  },
})

export const http = {
  policy,
  impl,
  request,
  binding: impl.request(fetchRequest),
}
