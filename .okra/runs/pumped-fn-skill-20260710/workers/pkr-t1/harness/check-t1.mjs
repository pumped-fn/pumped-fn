// Deterministic behavioral checker for T-1 (greenhouse control wiring).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t1.mjs <workspace>/ && cd <workspace> && node --import tsx check-t1.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.

import { createScope, isFlow, isTag, preset } from "@pumped-fn/lite"

const mod = await import("./src/greenhouse.ts")

const site = { siteName: "check-house", ventTargetC: 20, alertThresholdC: 28 }
const otherSite = { siteName: "other-house", ventTargetC: 25, alertThresholdC: 40 }

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
const faultText = (error) => {
  const parts = []
  let cursor = error
  let hops = 0
  while (cursor && hops < 10) {
    parts.push(String(cursor.message ?? ""))
    if (cursor.fault !== undefined) parts.push(JSON.stringify(cursor.fault))
    cursor = cursor.cause
    hops += 1
  }
  return parts.join(" ")
}
const rejection = async (promise, label) => {
  let error = null
  try {
    await promise
  } catch (caught) {
    error = caught
  }
  assert(error !== null, `${label}: expected rejection, but it resolved`)
  return error
}

const recordingConnection = () => {
  const log = []
  return {
    send: (command) => {
      log.push(command)
    },
    sent: () => [...log],
    isOpen: () => true,
  }
}

const execNames = []
const recorder = {
  name: "exec-recorder",
  wrapExec: (next, _target, ctx) => {
    execNames.push(ctx.name)
    return next()
  },
}

const mkScope = ({ withSite = site, driver = mod.servoDriver, bus, weather } = {}) => {
  const presets = []
  if (bus) presets.push(preset(mod.connection, bus))
  if (weather) presets.push(preset(mod.weatherService, weather))
  const scopeTags = []
  if (withSite) scopeTags.push(mod.siteConfig(withSite))
  if (driver) scopeTags.push(mod.ventDriver(driver))
  return createScope({ presets, tags: scopeTags, extensions: [recorder] })
}

const session = async (options, run) => {
  const scope = mkScope(options)
  const ctx = scope.createContext()
  try {
    return await run(ctx, scope)
  } finally {
    await ctx.close()
    await scope.dispose()
  }
}

const check = async (id, fn) => {
  try {
    await fn()
    checks[id] = "pass"
  } catch (error) {
    checks[id] = "fail"
    errors[id] = String(error?.message ?? error)
  }
}

await check("decl-exports", async () => {
  for (const name of [
    "captureReading",
    "planVentChange",
    "applyVentChange",
    "runVentAdjustment",
    "fetchDailyOutlook",
  ]) {
    assert(isFlow(mod[name]), `export ${name} is not an executable flow`)
  }
  for (const name of ["siteConfig", "ventDriver"]) {
    assert(isTag(mod[name]), `export ${name} is not a tag`)
  }
  for (const name of ["connection", "weatherService", "status", "servoDriver", "stepperDriver"]) {
    assert(mod[name] !== undefined, `export ${name} is missing`)
  }
})

await check("b1-adjustment-through-preset-connection", async () => {
  const bus = recordingConnection()
  await session({ bus }, async (ctx) => {
    const result = await ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 23.4 } })
    eq(result, { applied: 34, log: ["plan:34", "apply:34"] }, "adjustment result")
    eq(bus.sent(), ["servo:set:34"], "commands routed through substituted connection")
  })
})

await check("b2-sequential-siblings-fresh-record", async () => {
  const bus = recordingConnection()
  await session({ bus }, async (ctx) => {
    const first = await ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 23.4 } })
    const second = await ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 26 } })
    eq(first.log, ["plan:34", "apply:34"], "first operation log")
    eq(second.log, ["plan:60", "apply:60"], "second operation log must not accumulate")
    const standaloneA = await ctx.exec({ flow: mod.planVentChange, input: { temperatureC: 25 } })
    const standaloneB = await ctx.exec({ flow: mod.planVentChange, input: { temperatureC: 25 } })
    eq(standaloneA.recorded, 1, "standalone plan gets a fresh record")
    eq(standaloneB.recorded, 1, "repeat standalone plan gets a fresh record")
  })
})

await check("b3-concurrent-siblings-distinct", async () => {
  const bus = recordingConnection()
  await session({ bus }, async (ctx) => {
    const [first, second] = await Promise.all([
      ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 23.4 } }),
      ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 26 } }),
    ])
    eq(first.log, ["plan:34", "apply:34"], "concurrent sibling A log")
    eq(second.log, ["plan:60", "apply:60"], "concurrent sibling B log")
    eq(bus.sent().sort(), ["servo:set:34", "servo:set:60"], "both commands sent")
  })
})

await check("b4-nested-steps-share-record", async () => {
  const bus = recordingConnection()
  await session({ bus }, async (ctx) => {
    execNames.length = 0
    const result = await ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 22 } })
    eq(result.log, ["plan:20", "apply:20"], "nested plan and apply staged into one shared record")
    assert(execNames.includes("vent.plan"), "vent.plan not visible as a child execution")
    assert(execNames.includes("vent.apply"), "vent.apply not visible as a child execution")
  })
})

await check("n1-standalone-apply-no-plan", async () => {
  const bus = recordingConnection()
  await session({ bus }, async (ctx) => {
    const error = await rejection(ctx.exec({ flow: mod.applyVentChange }), "standalone apply")
    assert(faultText(error).includes("NO_PLAN"), `rejection does not carry NO_PLAN: ${faultText(error)}`)
    eq(bus.sent(), [], "failed apply sent nothing")
  })
})

await check("b5-driver-swap-per-scope", async () => {
  const servoBus = recordingConnection()
  const stepperBus = recordingConnection()
  await session({ bus: servoBus, driver: mod.servoDriver }, async (ctx) => {
    const result = await ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 23.4 } })
    eq(result.applied, 34, "servo applies exact aperture")
  })
  await session({ bus: stepperBus, driver: mod.stepperDriver }, async (ctx) => {
    const result = await ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 23.4 } })
    eq(result.applied, 30, "stepper rounds aperture to nearest 10")
  })
  eq(servoBus.sent(), ["servo:set:34"], "servo command")
  eq(stepperBus.sent(), ["stepper:step:30"], "stepper command")
})

await check("b6-status-derives-from-site-and-readings", async () => {
  await session({}, async (ctx, scope) => {
    eq(
      await scope.resolve(mod.status),
      { siteName: "check-house", level: "no-data", temperatureC: null },
      "status before any reading",
    )
    await ctx.exec({ flow: mod.captureReading, input: { temperatureC: 22 } })
    await scope.flush()
    eq(
      await scope.resolve(mod.status),
      { siteName: "check-house", level: "ok", temperatureC: 22 },
      "status after ok reading",
    )
  })
  await session({ withSite: otherSite }, async (ctx, scope) => {
    const glance = await scope.resolve(mod.status)
    eq(glance.siteName, "other-house", "status reflects the deployment's site configuration")
  })
})

await check("b7-status-reacts-to-reading-updates", async () => {
  await session({}, async (ctx, scope) => {
    await ctx.exec({ flow: mod.captureReading, input: { temperatureC: 22 } })
    await scope.flush()
    eq((await scope.resolve(mod.status)).level, "ok", "ok below threshold")
    await ctx.exec({ flow: mod.captureReading, input: { temperatureC: 30 } })
    await scope.flush()
    const after = await scope.resolve(mod.status)
    eq(after, { siteName: "check-house", level: "alert", temperatureC: 30 }, "status updated after reading change")
  })
})

await check("b8-connection-cleanup-on-dispose", async () => {
  const scope = mkScope({})
  const bus = await scope.resolve(mod.connection)
  assert(bus.isOpen() === true, "connection open while scope lives")
  await scope.dispose()
  assert(bus.isOpen() === false, "connection must be closed by scope disposal")
})

await check("t1-weather-call-traced-and-substitutable", async () => {
  const weather = { fetchForecast: async () => ({ highC: 31 }) }
  await session({ weather }, async (ctx) => {
    execNames.length = 0
    const outlook = await ctx.exec({ flow: mod.fetchDailyOutlook })
    eq(outlook, { siteName: "check-house", highC: 31 }, "outlook uses substituted weather service")
    assert(
      execNames.includes("weather.fetchForecast"),
      `weather.fetchForecast not visible in trace: ${JSON.stringify(execNames)}`,
    )
  })
})

await check("n2-missing-site-config-fails-loud", async () => {
  const scope = mkScope({ withSite: null })
  const error = await rejection(scope.resolve(mod.status), "status without site config")
  assert(/site/i.test(faultText(error)), `error does not identify site configuration: ${faultText(error)}`)
  const ctx = scope.createContext()
  await rejection(
    ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 23.4 } }),
    "adjustment without site config",
  )
  await ctx.close()
  await scope.dispose()
})

await check("n3-missing-driver-fails-loud", async () => {
  const scope = mkScope({ driver: null })
  const ctx = scope.createContext()
  await rejection(
    ctx.exec({ flow: mod.runVentAdjustment, input: { temperatureC: 23.4 } }),
    "adjustment without a vent driver",
  )
  await ctx.close()
  await scope.dispose()
})

const failed = Object.values(checks).filter((v) => v === "fail").length
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed === 0 ? 0 : 1)
