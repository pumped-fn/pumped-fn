import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { controller, createScope, flow, tag } from "../../../../../pkg/core/lite/dist/index.mjs"

const projection = tag({ label: "validator.dkr3.projection" })
const sinkBinding = tag({ label: "validator.dkr3.sink" })
const forbiddenConfig = tag({ label: "validator.dkr3.forbidden-config" })
const parentEvent = Symbol("validator.dkr3.parent-event")

const allowedKeys = Object.freeze([
  "sessionId",
  "activationId",
  "workId",
  "parentWorkId",
  "channel",
  "role",
  "tool",
])
const forbidden = Object.freeze([
  "credential-a-sensitive",
  "credential-b-sensitive",
  "prompt-a-sensitive",
  "prompt-b-sensitive",
  "/private/root-a",
  "/private/root-b",
])

function project(value) {
  const result = {}
  for (const key of allowedKeys) {
    const field = value?.[key]
    if (typeof field === "string" || typeof field === "number" || typeof field === "boolean") {
      result[key] = field
    }
  }
  return Object.freeze(result)
}

function sink() {
  const events = []
  const settlement = []
  return {
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

function ownerOf(ctx, target) {
  let current = ctx
  while (current.data.getTag(sinkBinding) !== target && current.parent) current = current.parent
  return current.data.getTag(sinkBinding) === target ? current : undefined
}

function observationExtension() {
  const registered = new WeakSet()
  let sequence = 0
  return {
    name: "validator.dkr3.observation",
    wrapExec: async (run, target, ctx) => {
      const output = ctx.data.seekTag(sinkBinding)
      assert(output)
      const owner = ownerOf(ctx, output)
      assert(owner)
      if (!registered.has(owner)) {
        registered.add(owner)
        owner.onClose(async (result) => {
          output.emit({
            id: `event-${++sequence}`,
            phase: "close",
            kind: "context",
            name: "activation",
            terminal: result.ok ? "success" : result.aborted ? "cancelled" : "error",
            context: project(owner.data.getTag(projection)),
          })
          await output.flush()
          await output.close()
        })
      }

      const id = `event-${++sequence}`
      const parentId = ctx.data.seek(parentEvent)
      ctx.data.set(parentEvent, id)
      const context = project(ctx.data.seekTag(projection))
      output.emit({
        id,
        ...(parentId === undefined ? {} : { parentId }),
        phase: "start",
        kind: "flow",
        name: ctx.name ?? target.name ?? "anonymous",
        context,
      })
      try {
        const value = await run()
        output.emit({
          id,
          ...(parentId === undefined ? {} : { parentId }),
          phase: "success",
          kind: "flow",
          name: ctx.name ?? target.name ?? "anonymous",
          terminal: "success",
          context,
        })
        return value
      } catch (error) {
        const cancelled = error instanceof Error && error.name === "AbortError"
        output.emit({
          id,
          ...(parentId === undefined ? {} : { parentId }),
          phase: cancelled ? "cancelled" : "error",
          kind: "flow",
          name: ctx.name ?? target.name ?? "anonymous",
          terminal: cancelled ? "cancelled" : "error",
          context,
        })
        throw error
      }
    },
  }
}

function deferred() {
  let resolve
  const promise = new Promise((onResolve) => { resolve = onResolve })
  return { promise, resolve }
}

const bothArrived = deferred()
let arrivalCount = 0

const inspect = flow({
  name: "github.tool.inspect",
  factory: async (ctx) => {
    arrivalCount++
    if (arrivalCount === 2) bothArrived.resolve()
    await bothArrived.promise
    if (ctx.input.fail) throw new Error("expected issue inspection failure")
    return ctx.input.sessionId
  },
})

const waitForReview = flow({
  name: "github.tool.wait-for-review",
  factory: () => {
    throw new DOMException("steered", "AbortError")
  },
})

const triage = flow({
  name: "github.role.triage",
  deps: {
    inspect: controller(inspect),
    waitForReview: controller(waitForReview),
  },
  factory: async (ctx, deps) => {
    const base = ctx.data.seekTag(projection)
    const result = await deps.inspect.exec({
      input: ctx.input,
      tags: [projection({
        ...base,
        workId: `work-${ctx.input.sessionId}`,
        parentWorkId: "issue-listener",
        role: "triager",
        tool: "github.inspect",
      })],
    })
    if (!ctx.input.fail) {
      await deps.waitForReview.exec({
        tags: [projection({
          ...base,
          workId: `work-${ctx.input.sessionId}`,
          parentWorkId: "issue-listener",
          role: "triager",
          tool: "github.wait-for-review",
        })],
      }).catch(() => undefined)
    }
    return result
  },
})

function forbiddenMatches(value) {
  const text = JSON.stringify(value)
  return forbidden.filter((sentinel) => text.includes(sentinel))
}

function verifySession(target, sessionId, activationId) {
  assert(target.events.length > 0)
  assert(target.events.every((event) => event.context.sessionId === sessionId))
  assert(target.events.every((event) => event.context.activationId === activationId))
  assert(target.events.every((event) => Object.keys(event.context).every((key) => allowedKeys.includes(key))))
  const root = target.events.find((event) => event.phase === "start" && event.name === "github.role.triage")
  const child = target.events.find((event) => event.phase === "start" && event.name === "github.tool.inspect")
  assert(root)
  assert(child)
  assert.equal(child.parentId, root.id)
  assert.deepEqual(target.settlement, ["activation-close", "flush", "close"])
}

export async function runProbe() {
  const sinkA = sink()
  const sinkB = sink()
  const scope = createScope({ extensions: [observationExtension()] })
  const contextA = scope.createContext({
    tags: [
      projection({
        sessionId: "session-a",
        activationId: "activation-a",
        channel: "github.issue",
        credential: forbidden[0],
      }),
      sinkBinding(sinkA),
      forbiddenConfig({ credential: forbidden[0], prompt: forbidden[2], roots: [forbidden[4]] }),
    ],
  })
  const contextB = scope.createContext({
    tags: [
      projection({
        sessionId: "session-b",
        activationId: "activation-b",
        channel: "github.issue",
        credential: forbidden[1],
      }),
      sinkBinding(sinkB),
      forbiddenConfig({ credential: forbidden[1], prompt: forbidden[3], roots: [forbidden[5]] }),
    ],
  })

  const settled = await Promise.allSettled([
    contextA.exec({ flow: triage, input: { fail: false, sessionId: "session-a" } }),
    contextB.exec({ flow: triage, input: { fail: true, sessionId: "session-b" } }),
  ])
  assert.equal(arrivalCount, 2)
  assert.equal(settled[0].status, "fulfilled")
  assert.equal(settled[1].status, "rejected")
  await contextA.close({ ok: true })
  await contextB.close({ ok: false, error: settled[1].reason })

  verifySession(sinkA, "session-a", "activation-a")
  verifySession(sinkB, "session-b", "activation-b")
  assert.equal(sinkA.events.some((event) => event.phase === "success"), true)
  assert.equal(sinkB.events.some((event) => event.phase === "error"), true)
  assert.equal(sinkA.events.some((event) => event.phase === "cancelled"), true)
  assert.deepEqual(forbiddenMatches({ sinkA, sinkB }), [])
  assert.equal(sinkA.events.some((event) => event.context.sessionId === "session-b"), false)
  assert.equal(sinkB.events.some((event) => event.context.sessionId === "session-a"), false)

  const dimensions = {
    session: true,
    activation: true,
    work: sinkA.events.some((event) => event.context.workId),
    channel: sinkA.events.some((event) => event.context.channel === "github.issue"),
    role: sinkA.events.some((event) => event.context.role === "triager"),
    tool: sinkA.events.some((event) => event.context.tool === "github.inspect"),
    parentage: sinkA.events.some((event) => event.parentId),
    success: sinkA.events.some((event) => event.phase === "success"),
    error: sinkB.events.some((event) => event.phase === "error"),
    cancellation: sinkA.events.some((event) => event.phase === "cancelled"),
    close: sinkA.events.some((event) => event.phase === "close") && sinkB.events.some((event) => event.phase === "close"),
    sinkFlush: sinkA.settlement.includes("flush") && sinkB.settlement.includes("flush"),
  }
  assert.equal(Object.keys(dimensions).length, 12)
  assert.equal(Object.values(dimensions).every(Boolean), true)
  await scope.dispose()

  return Object.freeze({
    probe: "validator-dkr-3-v3-independent-projection",
    projectionSourceCount: 1,
    dimensionPassCount: 12,
    dimensionTarget: 12,
    dimensions,
    overlappingArrivalCount: arrivalCount,
    sameScopeCrossSessionLeakCount: 0,
    forbiddenValueMatchCount: 0,
    arbitraryTagEnumerationExportCount: 0,
    unrestrictedContextExportCount: 0,
    terminalEventOrderingPassCount: 2,
    terminalEventOrderingTarget: 2,
    sessionASettlement: sinkA.settlement,
    sessionBSettlement: sinkB.settlement,
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runProbe(), null, 2)}\n`)
}
