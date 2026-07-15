import { pathToFileURL } from "node:url"
import { createScope, flow, tag } from "../../../../../../pkg/core/lite/dist/index.mjs"
import { observable } from "../../../../../../pkg/ext/observable/dist/index.mjs"

const forbidden = Object.freeze([
  "github-token-sensitive",
  "system-prompt-sensitive",
  "/private/tenant-root",
])

const secret = tag({ label: "probe.secret" })
const config = tag({ label: "probe.session.config" })
const activation = tag({ label: "probe.observation.activation" })
const current = tag({ label: "probe.observation.current" })
const span = Symbol("probe.observation.span")

const activationValue = Object.freeze({
  sessionId: "session-github-42",
  activationId: "activation-7",
})

const allowedContextKeys = Object.freeze([
  "sessionId",
  "activationId",
  "workId",
  "parentWorkId",
  "channel",
  "role",
  "tool",
])

function safe(value) {
  if (value === undefined) return undefined
  const projected = {}
  for (const key of allowedContextKeys) {
    const field = value[key]
    if (typeof field === "string" || typeof field === "number" || typeof field === "boolean") {
      projected[key] = field
    }
  }
  return Object.freeze(projected)
}

function operation(value) {
  return current(Object.freeze({ ...activationValue, ...value }))
}

function fixtures() {
  const success = flow({
    name: "github.tool.get_issue",
    factory: () => Object.freeze({ state: "open" }),
  })
  const failure = flow({
    name: "github.tool.list_comments",
    factory: () => {
      throw new Error("github read failed")
    },
  })
  const cancellation = flow({
    name: "github.tool.wait_for_review",
    factory: () => {
      throw new DOMException("steered", "AbortError")
    },
  })
  const role = flow({
    name: "github.role.issue_triage",
    factory: async (ctx) => {
      await ctx.exec({
        flow: success,
        tags: [operation({
          workId: "work-42",
          channel: "github.issue",
          role: "issue-triage",
          tool: "github.get_issue",
        })],
      })
      await ctx.exec({
        flow: failure,
        tags: [operation({
          workId: "work-42",
          channel: "github.issue",
          role: "issue-triage",
          tool: "github.list_comments",
        })],
      }).catch(() => undefined)
      await ctx.exec({
        flow: cancellation,
        tags: [operation({
          workId: "work-42",
          channel: "github.issue",
          role: "issue-triage",
          tool: "github.wait_for_review",
        })],
      }).catch(() => undefined)
      return "triaged"
    },
  })
  const work = flow({
    name: "github.work.issue_42",
    factory: (ctx) => ctx.exec({
      flow: role,
      tags: [operation({
        workId: "work-42",
        channel: "github.issue",
        role: "issue-triage",
      })],
    }),
  })
  return flow({
    name: "github.channel.issue",
    factory: (ctx) => ctx.exec({
      flow: work,
      tags: [operation({ workId: "work-42", channel: "github.issue" })],
    }),
  })
}

function sink() {
  const events = []
  const lifecycle = []
  return {
    events,
    lifecycle,
    emit(event) {
      events.push(event)
    },
    flush() {
      lifecycle.push("flush")
    },
    close() {
      lifecycle.push("close")
    },
  }
}

function observationExtension(target) {
  const registered = new WeakSet()
  let nextId = 0
  let time = 100

  return {
    name: "probe.safe-context-observation",
    wrapExec: async (run, execTarget, ctx) => {
      const owner = activationOwner(ctx)
      if (owner && !registered.has(owner)) {
        registered.add(owner)
        owner.onClose(async (result) => {
          target.emit({
            id: "activation-close",
            phase: "close",
            kind: "context",
            name: "session.activation",
            at: ++time,
            terminal: result.ok ? "success" : result.aborted ? "cancelled" : "error",
            context: safe(owner.data.getTag(activation)),
          })
          await target.flush()
          await target.close()
        })
      }

      const id = `candidate-${++nextId}`
      const parentId = ctx.data.seek(span)
      ctx.data.set(span, id)
      const context = safe(ctx.data.seekTag(current) ?? ctx.data.seekTag(activation))
      const startedAt = ++time
      target.emit({
        id,
        ...(parentId === undefined ? {} : { parentId }),
        phase: "start",
        kind: "flow",
        name: (ctx.name ?? execTarget.name) || "<anonymous>",
        at: startedAt,
        ...(context === undefined ? {} : { context }),
      })

      try {
        const output = await run()
        target.emit({
          id,
          ...(parentId === undefined ? {} : { parentId }),
          phase: "success",
          kind: "flow",
          name: (ctx.name ?? execTarget.name) || "<anonymous>",
          at: ++time,
          startedAt,
          terminal: "success",
          ...(context === undefined ? {} : { context }),
        })
        return output
      } catch (error) {
        const cancelled = error instanceof DOMException && error.name === "AbortError"
        target.emit({
          id,
          ...(parentId === undefined ? {} : { parentId }),
          phase: cancelled ? "cancelled" : "error",
          kind: "flow",
          name: (ctx.name ?? execTarget.name) || "<anonymous>",
          at: ++time,
          startedAt,
          terminal: cancelled ? "cancelled" : "error",
          error: {
            name: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error),
          },
          ...(context === undefined ? {} : { context }),
        })
        throw error
      }
    },
  }
}

function activationOwner(ctx) {
  let owner = ctx
  while (owner.data.getTag(activation) === undefined && owner.parent) owner = owner.parent
  return owner.data.getTag(activation) === undefined ? undefined : owner
}

function scan(value) {
  const text = JSON.stringify(value)
  return forbidden.filter((item) => text.includes(item))
}

async function baselineProbe() {
  const target = sink()
  let id = 0
  let time = 0
  const scope = createScope({ extensions: [observable.extension()] })
  await scope.ready
  const ctx = scope.createContext({
    tags: [
      observable.runtime({
        sinks: [target],
        now: () => ++time,
        id: () => `baseline-${++id}`,
        mapError: (error) => ({
          name: error instanceof Error ? error.name : undefined,
          message: error instanceof Error ? error.message : String(error),
        }),
      }),
      secret(forbidden[0]),
      config(Object.freeze({ systemPrompt: forbidden[1], roots: [forbidden[2]] })),
      activation(activationValue),
    ],
  })
  await ctx.exec({ flow: fixtures() })
  await ctx.close()
  const result = Object.freeze({ events: target.events, sinkLifecycle: target.lifecycle })
  await scope.dispose()
  return Object.freeze({
    ...result,
    forbiddenValueMatches: scan(result),
    eventContextFieldCount: target.events.filter((event) => "context" in event).length,
    cancellationPhaseCount: target.events.filter((event) => event.phase === "cancelled").length,
    closePhaseCount: target.events.filter((event) => event.phase === "close").length,
  })
}

async function candidateProbe() {
  const target = sink()
  const scope = createScope({ extensions: [observationExtension(target)] })
  await scope.ready
  const ctx = scope.createContext({
    tags: [
      activation(activationValue),
      secret(forbidden[0]),
      config(Object.freeze({ systemPrompt: forbidden[1], roots: [forbidden[2]] })),
    ],
  })
  await ctx.exec({
    flow: fixtures(),
    tags: [operation({ channel: "github.issue" })],
  })
  await ctx.close()
  const result = Object.freeze({ events: target.events, sinkLifecycle: target.lifecycle })
  await scope.dispose()
  return Object.freeze({
    ...result,
    forbiddenValueMatches: scan(result),
    contextKeys: Object.freeze([...new Set(target.events.flatMap((event) => Object.keys(event.context ?? {})))].sort()),
  })
}

export async function runProbe() {
  return Object.freeze({
    schemaVersion: 1,
    baseline: await baselineProbe(),
    candidate: await candidateProbe(),
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runProbe(), null, 2)}\n`)
}
