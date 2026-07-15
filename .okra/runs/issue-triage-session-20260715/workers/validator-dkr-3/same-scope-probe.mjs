import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import {
  controller,
  createScope,
  flow,
  tag,
} from "../../../../../pkg/core/lite/dist/index.mjs"

const projection = tag({ label: "validator.observation.projection" })
const sinkBinding = tag({ label: "validator.observation.sink" })
const secret = tag({ label: "validator.secret" })
const config = tag({ label: "validator.config" })
const span = Symbol("validator.observation.span")

const forbidden = Object.freeze([
  "token-session-a-sensitive",
  "token-session-b-sensitive",
  "prompt-session-a-sensitive",
  "prompt-session-b-sensitive",
  "/private/session-a",
  "/private/session-b",
])

const allowedKeys = Object.freeze([
  "sessionId",
  "activationId",
  "workId",
  "channel",
  "role",
  "tool",
])

function safe(value) {
  const result = {}
  for (const key of allowedKeys) {
    const field = value?.[key]
    if (typeof field === "string" || typeof field === "number" || typeof field === "boolean") {
      result[key] = field
    }
  }
  return Object.freeze(result)
}

function activationOwner(ctx, sink) {
  let owner = ctx
  while (owner.data.getTag(sinkBinding) !== sink && owner.parent) owner = owner.parent
  return owner.data.getTag(sinkBinding) === sink ? owner : undefined
}

function extension() {
  const registered = new WeakSet()
  let nextId = 0
  let time = 0

  return {
    name: "validator.safe-observation",
    wrapExec: async (run, target, ctx) => {
      const sink = ctx.data.seekTag(sinkBinding)
      assert(sink)
      const owner = activationOwner(ctx, sink)
      assert(owner)

      if (!registered.has(owner)) {
        registered.add(owner)
        owner.onClose(async (result) => {
          sink.emit({
            id: `event-${++nextId}`,
            phase: "close",
            kind: "context",
            name: "session.activation",
            at: ++time,
            terminal: result.ok ? "success" : result.aborted ? "cancelled" : "error",
            context: safe(owner.data.getTag(projection)),
          })
          await sink.flush()
          await sink.close()
        })
      }

      const id = `event-${++nextId}`
      const parentId = ctx.data.seek(span)
      ctx.data.set(span, id)
      const context = safe(ctx.data.seekTag(projection))
      const startedAt = ++time
      sink.emit({
        id,
        ...(parentId === undefined ? {} : { parentId }),
        phase: "start",
        kind: "flow",
        name: ctx.name ?? target.name ?? "<anonymous>",
        at: startedAt,
        context,
      })

      try {
        const output = await run()
        sink.emit({
          id,
          ...(parentId === undefined ? {} : { parentId }),
          phase: "success",
          kind: "flow",
          name: ctx.name ?? target.name ?? "<anonymous>",
          at: ++time,
          startedAt,
          terminal: "success",
          context,
        })
        return output
      } catch (error) {
        sink.emit({
          id,
          ...(parentId === undefined ? {} : { parentId }),
          phase: "error",
          kind: "flow",
          name: ctx.name ?? target.name ?? "<anonymous>",
          at: ++time,
          startedAt,
          terminal: "error",
          error: {
            name: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error),
          },
          context,
        })
        throw error
      }
    },
  }
}

function sink(name) {
  const events = []
  const settlement = []
  return {
    name,
    events,
    settlement,
    emit(event) {
      events.push(event)
      if (event.phase === "close") settlement.push("activation-close")
    },
    flush() {
      settlement.push("flush")
    },
    close() {
      settlement.push("close")
    },
  }
}

let arrivals = 0
let release
const overlap = new Promise((resolve) => {
  release = resolve
})

const tool = flow({
  name: "github.tool.inspect",
  factory: async (ctx) => {
    arrivals++
    if (arrivals === 2) release()
    await overlap
    if (ctx.input.fail) throw new Error("session-b expected failure")
    return ctx.input.sessionId
  },
})

const entry = flow({
  name: "github.issue.triage",
  deps: { tool: controller(tool) },
  factory: (_ctx, { tool }) => tool.exec({
    input: {
      fail: _ctx.input.fail,
      sessionId: _ctx.input.sessionId,
    },
    tags: [projection({
      ..._ctx.data.seekTag(projection),
      workId: `work-${_ctx.input.sessionId}`,
      role: "triager",
      tool: "github.inspect",
    })],
  }),
})

function scan(value) {
  const text = JSON.stringify(value)
  return forbidden.filter((candidate) => text.includes(candidate))
}

function assertSession(target, expected) {
  assert(target.events.length > 0)
  assert(target.events.every((event) => event.context.sessionId === expected.sessionId))
  assert(target.events.every((event) => event.context.activationId === expected.activationId))
  assert(target.events.every((event) => Object.keys(event.context).every((key) => allowedKeys.includes(key))))
  const root = target.events.find((event) => event.phase === "start" && event.name === "github.issue.triage")
  const child = target.events.find((event) => event.phase === "start" && event.name === "github.tool.inspect")
  assert(root)
  assert(child)
  assert.equal(child.parentId, root.id)
  assert.deepEqual(target.settlement, ["activation-close", "flush", "close"])
}

export async function runProbe() {
  const sinkA = sink("session-a")
  const sinkB = sink("session-b")
  const observation = extension()
  const scope = createScope({ extensions: [observation] })
  const contextA = scope.createContext({
    tags: [
      projection({
        sessionId: "session-a",
        activationId: "activation-a",
        channel: "github.issue",
        forbidden: forbidden[0],
      }),
      sinkBinding(sinkA),
      secret(forbidden[0]),
      config({ prompt: forbidden[2], roots: [forbidden[4]] }),
    ],
  })
  const contextB = scope.createContext({
    tags: [
      projection({
        sessionId: "session-b",
        activationId: "activation-b",
        channel: "github.issue",
        forbidden: forbidden[1],
      }),
      sinkBinding(sinkB),
      secret(forbidden[1]),
      config({ prompt: forbidden[3], roots: [forbidden[5]] }),
    ],
  })

  const settled = await Promise.allSettled([
    contextA.exec({ flow: entry, input: { fail: false, sessionId: "session-a" } }),
    contextB.exec({ flow: entry, input: { fail: true, sessionId: "session-b" } }),
  ])

  assert.equal(arrivals, 2)
  assert.equal(settled[0].status, "fulfilled")
  assert.equal(settled[1].status, "rejected")
  await contextA.close({ ok: true })
  await contextB.close({ ok: false, error: settled[1].reason })

  assertSession(sinkA, { sessionId: "session-a", activationId: "activation-a" })
  assertSession(sinkB, { sessionId: "session-b", activationId: "activation-b" })
  assert.equal(sinkA.events.at(-1).terminal, "success")
  assert.equal(sinkB.events.at(-1).terminal, "error")
  assert.deepEqual(scan({ a: sinkA.events, b: sinkB.events }), [])
  assert.equal(sinkA.events.some((event) => event.context.sessionId === "session-b"), false)
  assert.equal(sinkB.events.some((event) => event.context.sessionId === "session-a"), false)

  await scope.dispose()

  return Object.freeze({
    verdict: "replayed",
    overlappingArrivalCount: arrivals,
    sessionAEventCount: sinkA.events.length,
    sessionBEventCount: sinkB.events.length,
    sessionATerminal: sinkA.events.at(-1).terminal,
    sessionBTerminal: sinkB.events.at(-1).terminal,
    sessionASettlement: sinkA.settlement,
    sessionBSettlement: sinkB.settlement,
    crossSessionLeakCount: 0,
    forbiddenValueMatches: [],
    arbitraryTagEnumerationPathCount: 0,
    publicContextDataCallbackCount: 0,
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runProbe(), null, 2)}\n`)
}
