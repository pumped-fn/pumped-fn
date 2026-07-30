import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createScope, flow, resource } from "../../../../pkg/core/lite/src/index.ts"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function chain(preResolve: boolean) {
  const events: string[] = []
  let accessLive = false
  let poolLive = false
  const pool = resource({
    name: `probe-pool-${preResolve}`,
    factory: (ctx) => {
      poolLive = true
      ctx.cleanup(() => {
        poolLive = false
        events.push("cleanup:pool")
      })
      return { kind: "pool" }
    },
  })
  const access = resource({
    name: `probe-access-${preResolve}`,
    deps: { pool },
    factory: (ctx) => {
      accessLive = true
      ctx.cleanup(() => {
        accessLive = false
        events.push(`cleanup:access:pool-${poolLive ? "live" : "closed"}`)
      })
      return { kind: "access" }
    },
  })
  const session = resource({
    name: `probe-session-${preResolve}`,
    deps: { access },
    factory: (ctx) => {
      ctx.onClose(() => {
        events.push(`finalize:session:access-${accessLive ? "live" : "closed"}`)
      })
      ctx.cleanup(() => {
        events.push(`cleanup:session:access-${accessLive ? "live" : "closed"}`)
      })
      return { kind: "session" }
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  if (preResolve) {
    await ctx.resolve(pool)
    await ctx.resolve(access)
  }
  await ctx.resolve(session)
  await ctx.close()
  await scope.dispose()
  return events
}

async function diamond() {
  const events: string[] = []
  let poolCreates = 0
  const pool = resource({
    name: "probe-diamond-pool",
    factory: (ctx) => {
      poolCreates++
      ctx.cleanup(() => events.push("cleanup:pool"))
      return { kind: "pool" }
    },
  })
  const left = resource({
    name: "probe-diamond-left",
    deps: { pool },
    factory: (ctx) => {
      ctx.cleanup(() => events.push("cleanup:left"))
      return { kind: "left" }
    },
  })
  const right = resource({
    name: "probe-diamond-right",
    deps: { pool },
    factory: (ctx) => {
      ctx.cleanup(() => events.push("cleanup:right"))
      return { kind: "right" }
    },
  })
  const session = resource({
    name: "probe-diamond-session",
    deps: { left, right },
    factory: (ctx) => {
      ctx.cleanup(() => events.push("cleanup:session"))
      return { kind: "session" }
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await ctx.resolve(session)
  await ctx.close()
  await scope.dispose()
  assert.equal(poolCreates, 1)
  return events
}

async function releaseAsymmetry() {
  const events: string[] = []
  let accessLive = false
  const access = resource({
    name: "probe-release-access",
    factory: (ctx) => {
      accessLive = true
      ctx.cleanup(() => {
        accessLive = false
        events.push("cleanup:access")
      })
      return { kind: "access" }
    },
  })
  const session = resource({
    name: "probe-release-session",
    deps: { access },
    factory: (ctx) => {
      ctx.onClose(() => events.push(`finalize:session:access-${accessLive ? "live" : "closed"}`))
      ctx.cleanup(() => events.push("cleanup:session"))
      return { kind: "session" }
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await ctx.resolve(session)
  await ctx.release(session)
  const afterRelease = [...events]
  assert.equal(accessLive, true)
  await ctx.close()
  await scope.dispose()
  return { afterRelease, afterClose: events }
}

async function sharedDependencyRelease() {
  const events: string[] = []
  let accessCreates = 0
  const access = resource({
    name: "probe-shared-access",
    factory: (ctx) => {
      accessCreates++
      ctx.cleanup(() => events.push("cleanup:access"))
      return { kind: "access" }
    },
  })
  const first = resource({
    name: "probe-shared-first",
    deps: { access },
    factory: (ctx) => {
      ctx.cleanup(() => events.push("cleanup:first"))
      return { kind: "first" }
    },
  })
  const second = resource({
    name: "probe-shared-second",
    deps: { access },
    factory: (ctx) => {
      ctx.cleanup(() => events.push("cleanup:second"))
      return { kind: "second" }
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await ctx.resolve(first)
  await ctx.resolve(second)
  await ctx.release(first)
  const afterFirstRelease = [...events]
  assert.equal(accessCreates, 1)
  await ctx.resolve(second)
  await ctx.close()
  await scope.dispose()
  return { afterFirstRelease, afterClose: events }
}

async function currentOwnership() {
  let creates = 0
  const session = resource({
    name: "probe-current-session",
    ownership: "current",
    factory: () => ({ id: ++creates }),
  })
  const inner = flow({
    name: "probe-current-inner",
    deps: { session },
    factory: (_ctx, { session }) => session.id,
  })
  const outer = flow({
    name: "probe-current-outer",
    deps: { session },
    factory: async (ctx, { session }) => [session.id, await ctx.exec({ flow: inner })],
  })
  const read = flow({
    name: "probe-current-read",
    deps: { session },
    factory: (_ctx, { session }) => session.id,
  })
  const scope = createScope()
  const parent = scope.createContext()
  const nestedFirst = await parent.exec({ flow: outer })
  const nestedSecond = await parent.exec({ flow: outer })
  const child = scope.createContext({ parent })
  const parentSession = await parent.resolve(session)
  const childSession = await child.resolve(session)
  const childRead = await child.exec({ flow: read })
  assert.deepEqual(nestedFirst, [1, 1])
  assert.deepEqual(nestedSecond, [2, 2])
  assert.notEqual(parentSession.id, childSession.id)
  assert.equal(childSession.id, childRead)
  await child.close()
  await parent.close()
  await scope.dispose()
  return {
    nestedFirst,
    nestedSecond,
    explicitBoundary: { parent: parentSession.id, child: childSession.id, childRead },
  }
}

async function activeStreamParentClose() {
  const events: string[] = []
  let active = false
  const query = resource({
    name: "probe-active-query",
    ownership: "current",
    factory: (ctx) => {
      active = true
      ctx.onClose((result) => events.push(`query-close:aborted-${result.ok ? "false" : result.aborted === true}`))
      ctx.cleanup(() => {
        active = false
        events.push("cleanup:query")
      })
      return { kind: "query" }
    },
  })
  const run = flow({
    name: "probe-active-stream",
    deps: { query },
    factory: async function* (_ctx, { query }) {
      yield query.kind
      yield "still-running"
      return "done"
    },
  })
  const scope = createScope()
  const parent = scope.createContext()
  const stream = parent.execStream({ flow: run })
  const iterator = stream[Symbol.asyncIterator]()
  assert.deepEqual(await iterator.next(), { done: false, value: "query" })
  await parent.close()
  const afterParentClose = { active, events: [...events] }
  assert.equal(active, true)
  await iterator.return?.()
  await assert.rejects(stream.result, /Flow stream aborted/)
  const afterIteratorReturn = { active, events: [...events] }
  await scope.dispose()
  return { afterParentClose, afterIteratorReturn }
}

async function nonjoinableClose() {
  const gate = deferred()
  let teardownCalls = 0
  const session = resource({
    name: "probe-nonjoin-close",
    factory: (ctx) => {
      ctx.onClose(async () => {
        teardownCalls++
        await gate.promise
      })
      return { kind: "session" }
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await ctx.resolve(session)
  const first = ctx.close()
  let firstSettled = false
  void first.then(() => {
    firstSettled = true
  })
  await ctx.close()
  const secondSettledWhileFirstPending = !firstSettled
  assert.equal(secondSettledWhileFirstPending, true)
  assert.equal(teardownCalls, 1)
  gate.resolve()
  await first
  await scope.dispose()
  return { secondSettledWhileFirstPending, teardownCalls }
}

async function nonjoinableRelease() {
  const gate = deferred()
  let teardownCalls = 0
  const session = resource({
    name: "probe-nonjoin-release",
    factory: (ctx) => {
      ctx.cleanup(async () => {
        teardownCalls++
        await gate.promise
      })
      return { kind: "session" }
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await ctx.resolve(session)
  const first = ctx.release(session)
  let firstSettled = false
  void first.then(() => {
    firstSettled = true
  })
  await ctx.release(session)
  const secondSettledWhileFirstPending = !firstSettled
  assert.equal(secondSettledWhileFirstPending, true)
  assert.equal(teardownCalls, 1)
  gate.resolve()
  await first
  await ctx.close()
  await scope.dispose()
  return { secondSettledWhileFirstPending, teardownCalls }
}

async function main() {
  const artifactPath = process.argv[2]
  if (artifactPath) {
    const artifact = readFileSync(artifactPath, "utf8")
    assert.match(artifact, /checkpoint\.DKR-LIFECYCLE-1\.round-1/)
    assert.match(artifact, /dependency_using_finalization_after_dependency_close_count/)
    assert.match(artifact, /"downstream_advance": "blocked"/)
  }
  const observations = {
    coldChain: await chain(false),
    preResolvedChain: await chain(true),
    coldDiamond: await diamond(),
    releaseAsymmetry: await releaseAsymmetry(),
    sharedDependencyRelease: await sharedDependencyRelease(),
    currentOwnership: await currentOwnership(),
    activeStreamParentClose: await activeStreamParentClose(),
    nonjoinableClose: await nonjoinableClose(),
    nonjoinableRelease: await nonjoinableRelease(),
  }

  assert.deepEqual(observations.coldChain, [
    "finalize:session:access-live",
    "cleanup:pool",
    "cleanup:access:pool-closed",
    "cleanup:session:access-closed",
  ])
  assert.deepEqual(observations.preResolvedChain, [
    "finalize:session:access-live",
    "cleanup:session:access-live",
    "cleanup:access:pool-live",
    "cleanup:pool",
  ])
  assert.deepEqual(observations.coldDiamond, [
    "cleanup:right",
    "cleanup:pool",
    "cleanup:left",
    "cleanup:session",
  ])
  assert.deepEqual(observations.releaseAsymmetry.afterRelease, ["cleanup:session"])
  assert.deepEqual(observations.releaseAsymmetry.afterClose, [
    "cleanup:session",
    "finalize:session:access-live",
    "cleanup:access",
  ])
  assert.deepEqual(observations.sharedDependencyRelease.afterFirstRelease, ["cleanup:first"])
  assert.deepEqual(observations.sharedDependencyRelease.afterClose, [
    "cleanup:first",
    "cleanup:second",
    "cleanup:access",
  ])
  assert.deepEqual(observations.activeStreamParentClose.afterParentClose, { active: true, events: [] })
  assert.deepEqual(observations.activeStreamParentClose.afterIteratorReturn, {
    active: false,
    events: ["query-close:aborted-true", "cleanup:query"],
  })

  process.stdout.write(`${JSON.stringify({ status: "pass", observations }, null, 2)}\n`)
}

void main()
