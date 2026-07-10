// Deterministic behavioral checker for T-3 (observatory nightly capture + archive upload).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t3.mjs <workspace>/ && cd <workspace> && node --import tsx check-t3.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.
//
// Anti-scripting design: the checker constructs the solution's PRODUCTION backend itself
// (createObservatoryBackend with a store+clock the checker owns) and presets the instrument
// and archive ports at scope level. The only path from a scheduler run to those ports is
// schedule()'s tick closure exec-ing the production flows — a backend that fabricates
// outputs cannot reach the preset ports, and hand-built job atoms never hit the probe.

import { createScope, preset } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

const obs = await import("./src/observatory.ts")
const backend = await import("./src/backend.ts")

const T0 = 1_750_000_000_000

const checks = {}
const errors = {}

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  assert(a === b, `${label}: expected ${b}, got ${a}`)
}
const settle = async () => {
  for (let i = 0; i < 15; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}
const deferred = () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  return { gate, release }
}
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}: still pending after ${ms}ms`)), ms)
      timer.unref?.()
    }),
  ])

const memStore = (seed = {}) => {
  const state = new Map(Object.entries(seed))
  return {
    load: (name) => state.get(name),
    save: (name, entry) => {
      state.set(name, { ...entry })
    },
  }
}
const frozenClock = (nowMs) => ({ nowMs: () => nowMs, every: () => () => {} })

const recorders = () => {
  const reads = []
  const sends = []
  return {
    reads,
    sends,
    presets: (options = {}) => [
      preset(obs.instrument, {
        read: async () => {
          const value = (reads.length + 1) * 100
          reads.push(value)
          if (options.read) return options.read(value)
          return value
        },
      }),
      preset(obs.archive, {
        send: async (manifest) => {
          sends.push(manifest)
          if (options.send) await options.send(manifest)
        },
      }),
    ],
  }
}

const productionScope = ({ store, nowMs = T0, ports, portOptions }) =>
  createScope({
    tags: [
      scheduler.backend(backend.createObservatoryBackend({ store, clock: frozenClock(nowMs) })),
    ],
    presets: ports.presets(portOptions),
  })

const check = async (id, run) => {
  try {
    await withTimeout(run(), 8000, id)
    checks[id] = "pass"
  } catch (error) {
    checks[id] = "fail"
    errors[id] = String(error?.message ?? error)
  }
}

let capEvery = 0
let upEvery = 0

await check("decl-jobs-register-opposite-policies", async () => {
  const captured = []
  const probe = {
    register(spec, tick) {
      captured.push({ spec, tick })
      return { trigger: async () => {}, next: () => undefined, stop: async () => {} }
    },
  }
  const ports = recorders()
  const scope = createScope({ tags: [scheduler.backend(probe)], presets: ports.presets() })
  await scope.resolve(obs.captureJob)
  await scope.resolve(obs.uploadJob)
  eq(captured.length, 2, "decl: two registrations expected")
  const capture = captured.find((entry) => entry.spec.name === "nightly-capture")
  const upload = captured.find((entry) => entry.spec.name === "archive-upload")
  assert(capture, "decl: no registration named nightly-capture")
  assert(upload, "decl: no registration named archive-upload")
  eq(capture.spec.overlap, "skip", "decl: capture overlap")
  eq(capture.spec.catchUp, "skip", "decl: capture catchUp")
  eq(upload.spec.overlap, "queue", "decl: upload overlap")
  eq(upload.spec.catchUp, "all", "decl: upload catchUp")
  assert("every" in capture.spec.cadence, "decl: capture cadence must be { every }")
  assert("every" in upload.spec.cadence, "decl: upload cadence must be { every }")
  capEvery = Number(capture.spec.cadence.every)
  upEvery = Number(upload.spec.cadence.every)
  assert(capEvery > 0 && upEvery > 0, "decl: cadence.every must be positive ms")
  await scope.dispose()
})

await check("decl-tick-executes-production-flows", async () => {
  const captured = []
  const probe = {
    register(spec, tick) {
      captured.push({ spec, tick })
      return { trigger: async () => {}, next: () => undefined, stop: async () => {} }
    },
  }
  const ports = recorders()
  const scope = createScope({ tags: [scheduler.backend(probe)], presets: ports.presets() })
  await scope.resolve(obs.captureJob)
  await scope.resolve(obs.uploadJob)
  const capture = captured.find((entry) => entry.spec.name === "nightly-capture")
  const upload = captured.find((entry) => entry.spec.name === "archive-upload")
  await capture.tick({ key: "probe:capture", scheduledAt: new Date(T0) })
  eq(ports.reads.length, 1, "probe tick must run the production capture flow")
  await upload.tick({ key: "probe:upload", scheduledAt: new Date(T0) })
  eq(ports.sends, [{ readings: [100] }], "probe tick must run the production upload flow")
  await scope.dispose()
})

await check("b1-capture-overlap-drops-not-defers", async () => {
  const gate = deferred()
  const ports = recorders()
  const scope = productionScope({
    store: memStore(),
    ports,
    portOptions: { read: (value) => gate.gate.then(() => value) },
  })
  const capture = await scope.resolve(obs.captureJob)
  const firstRun = capture.trigger()
  const secondRun = capture.trigger()
  await settle()
  eq(ports.reads.length, 1, "second overlapping capture must not start")
  gate.release()
  await Promise.all([firstRun, secondRun])
  await settle()
  eq(ports.reads.length, 1, "dropped capture must not run later either")
  await capture.trigger()
  eq(ports.reads.length, 2, "capture must run again once idle")
  await scope.dispose()
})

await check("b2-upload-overlap-queues-strictly", async () => {
  const gates = [deferred(), deferred()]
  let active = 0
  let maxActive = 0
  let calls = 0
  const ports = recorders()
  const scope = productionScope({
    store: memStore(),
    ports,
    portOptions: {
      send: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        const slot = gates[Math.min(calls, gates.length - 1)]
        calls += 1
        await slot.gate
        active -= 1
      },
    },
  })
  const upload = await scope.resolve(obs.uploadJob)
  const firstRun = upload.trigger()
  const secondRun = upload.trigger()
  await settle()
  eq(ports.sends.length, 1, "second upload must wait for the first")
  gates[0].release()
  await settle()
  eq(ports.sends.length, 2, "queued upload must run after the first completes")
  gates[1].release()
  await Promise.all([firstRun, secondRun])
  eq(maxActive, 1, "uploads must never run concurrently")
  await scope.dispose()
})

await check("b3-upload-catchup-runs-all-missed-windows", async () => {
  const store = memStore({
    "nightly-capture": { lastRunMs: T0 },
    "archive-upload": { lastRunMs: T0 - 3 * upEvery },
  })
  const ports = recorders()
  const scope = productionScope({ store, ports })
  const capture = await scope.resolve(obs.captureJob)
  await capture.trigger()
  await capture.trigger()
  const upload = await scope.resolve(obs.uploadJob)
  await upload.stop()
  await scope.dispose()
  eq(
    ports.sends,
    [{ readings: [100, 200] }, { readings: [] }, { readings: [] }],
    "three missed windows must produce three production upload runs, oldest first",
  )
  eq(store.load("archive-upload"), { lastRunMs: T0 }, "upload history must advance to the newest window")
})

await check("b3b-catchup-is-idempotent-across-restart", async () => {
  const store = memStore({ "archive-upload": { lastRunMs: T0 - 2 * upEvery } })
  const firstPorts = recorders()
  const firstScope = productionScope({ store, ports: firstPorts })
  const firstUpload = await firstScope.resolve(obs.uploadJob)
  await firstUpload.stop()
  await firstScope.dispose()
  eq(firstPorts.sends.length, 2, "two missed windows expected on first boot")
  const secondPorts = recorders()
  const secondScope = productionScope({ store, ports: secondPorts })
  const secondUpload = await secondScope.resolve(obs.uploadJob)
  await secondUpload.stop()
  await secondScope.dispose()
  eq(secondPorts.sends.length, 0, "a caught-up station must not replay on restart")
})

await check("b4-capture-missed-windows-are-lost", async () => {
  const store = memStore({ "nightly-capture": { lastRunMs: T0 - 3 * capEvery } })
  const ports = recorders()
  const scope = productionScope({ store, ports })
  await scope.resolve(obs.captureJob)
  await scope.dispose()
  eq(ports.reads.length, 0, "capture must never replay missed windows")
  eq(store.load("nightly-capture"), { lastRunMs: T0 }, "lost capture windows must still be marked handled")
})

await check("b5-failed-upload-retries-frames-and-chain-survives", async () => {
  let attempts = 0
  const ports = recorders()
  const scope = productionScope({
    store: memStore(),
    ports,
    portOptions: {
      send: async () => {
        attempts += 1
        if (attempts === 1) throw new Error("archive offline")
      },
    },
  })
  const capture = await scope.resolve(obs.captureJob)
  await capture.trigger()
  const upload = await scope.resolve(obs.uploadJob)
  let rejected = false
  await upload.trigger().catch(() => {
    rejected = true
  })
  assert(rejected, "a failed upload run must reject its trigger")
  await upload.trigger()
  await upload.trigger()
  eq(
    ports.sends,
    [{ readings: [100] }, { readings: [100] }, { readings: [] }],
    "frames must stay unsent after a failure and ship on the next run",
  )
  await scope.dispose()
})

await check("b6-fresh-station-starts-from-now", async () => {
  const store = memStore()
  const ports = recorders()
  const scope = productionScope({ store, ports })
  const upload = await scope.resolve(obs.uploadJob)
  await upload.stop()
  await scope.dispose()
  eq(ports.sends.length, 0, "a fresh station has no missed windows")
  eq(store.load("archive-upload"), { lastRunMs: T0 }, "fresh registration must record now as handled")
})

await check("b7-dispose-awaits-inflight-run", async () => {
  const gate = deferred()
  const ports = recorders()
  const scope = productionScope({
    store: memStore(),
    ports,
    portOptions: { read: (value) => gate.gate.then(() => value) },
  })
  const capture = await scope.resolve(obs.captureJob)
  const run = capture.trigger()
  await settle()
  let disposed = false
  const disposal = scope.dispose().then(() => {
    disposed = true
  })
  await settle()
  assert(!disposed, "dispose must wait for the in-flight capture")
  gate.release()
  await run
  await disposal
  assert(disposed, "dispose must resolve after the run settles")
})

const failed = Object.entries(checks)
  .filter(([, verdict]) => verdict === "fail")
  .map(([id]) => id)
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed.length === 0 ? 0 : 1)
