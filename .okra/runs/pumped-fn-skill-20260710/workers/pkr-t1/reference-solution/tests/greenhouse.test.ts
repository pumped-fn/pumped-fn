import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  applyVentChange,
  captureReading,
  connection,
  fetchDailyOutlook,
  planVentChange,
  runVentAdjustment,
  servoDriver,
  siteConfig,
  status,
  stepperDriver,
  ventDriver,
  weatherService,
} from "../src/greenhouse"

const unitSite = { siteName: "unit-house", ventTargetC: 20, alertThresholdC: 28 }

const recordingConnection = () => {
  const log: string[] = []
  return {
    send: (command: string) => {
      log.push(command)
    },
    sent: () => [...log],
    isOpen: () => true,
  }
}

describe("greenhouse control wiring", () => {
  it("routes vent commands through a substituted connection", async () => {
    const bus = recordingConnection()
    const scope = createScope({
      presets: [preset(connection, bus)],
      tags: [siteConfig(unitSite), ventDriver(servoDriver)],
    })
    const ctx = scope.createContext()
    const result = await ctx.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } })
    expect(result).toEqual({ applied: 34, log: ["plan:34", "apply:34"] })
    expect(bus.sent()).toEqual(["servo:set:34"])
    await ctx.close()
    await scope.dispose()
  })

  it("swaps the vent driver per scope without code edits", async () => {
    const bus = recordingConnection()
    const scope = createScope({
      presets: [preset(connection, bus)],
      tags: [siteConfig(unitSite), ventDriver(stepperDriver)],
    })
    const ctx = scope.createContext()
    const result = await ctx.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } })
    expect(result.applied).toBe(30)
    expect(bus.sent()).toEqual(["stepper:step:30"])
    await ctx.close()
    await scope.dispose()
  })

  it("fails loudly at materialization without site configuration", async () => {
    const scope = createScope({ tags: [ventDriver(servoDriver)] })
    await expect(scope.resolve(status)).rejects.toThrow()
    const ctx = scope.createContext()
    await expect(
      ctx.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } }),
    ).rejects.toThrow()
    await ctx.close()
    await scope.dispose()
  })

  it("keeps sibling operations on distinct work records while nested steps share", async () => {
    const bus = recordingConnection()
    const scope = createScope({
      presets: [preset(connection, bus)],
      tags: [siteConfig(unitSite), ventDriver(servoDriver)],
    })
    const ctx = scope.createContext()
    const [first, second] = await Promise.all([
      ctx.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } }),
      ctx.exec({ flow: runVentAdjustment, input: { temperatureC: 26 } }),
    ])
    expect(first.log).toEqual(["plan:34", "apply:34"])
    expect(second.log).toEqual(["plan:60", "apply:60"])
    const standaloneA = await ctx.exec({ flow: planVentChange, input: { temperatureC: 25 } })
    const standaloneB = await ctx.exec({ flow: planVentChange, input: { temperatureC: 25 } })
    expect(standaloneA.recorded).toBe(1)
    expect(standaloneB.recorded).toBe(1)
    await ctx.close()
    await scope.dispose()
  })

  it("rejects a standalone apply with NO_PLAN and sends nothing", async () => {
    const bus = recordingConnection()
    const scope = createScope({
      presets: [preset(connection, bus)],
      tags: [siteConfig(unitSite), ventDriver(servoDriver)],
    })
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: applyVentChange })).rejects.toThrow(/NO_PLAN/)
    expect(bus.sent()).toEqual([])
    await ctx.close()
    await scope.dispose()
  })

  it("derives status and reacts when readings change", async () => {
    const scope = createScope({
      tags: [siteConfig(unitSite), ventDriver(servoDriver)],
    })
    expect(await scope.resolve(status)).toEqual({
      siteName: "unit-house",
      level: "no-data",
      temperatureC: null,
    })
    const ctx = scope.createContext()
    await ctx.exec({ flow: captureReading, input: { temperatureC: 30 } })
    await scope.flush()
    expect(await scope.resolve(status)).toEqual({
      siteName: "unit-house",
      level: "alert",
      temperatureC: 30,
    })
    await ctx.close()
    await scope.dispose()
  })

  it("substitutes the weather service and traces the foreign call by name", async () => {
    const names: (string | undefined)[] = []
    const scope = createScope({
      presets: [preset(weatherService, { fetchForecast: async () => ({ highC: 31 }) })],
      tags: [siteConfig(unitSite), ventDriver(servoDriver)],
      extensions: [
        {
          name: "exec-recorder",
          wrapExec: (next, _target, ctx) => {
            names.push(ctx.name)
            return next()
          },
        },
      ],
    })
    const ctx = scope.createContext()
    const outlook = await ctx.exec({ flow: fetchDailyOutlook })
    expect(outlook).toEqual({ siteName: "unit-house", highC: 31 })
    expect(names).toContain("weather.fetchForecast")
    await ctx.close()
    await scope.dispose()
  })

  it("closes the shared connection when the scope is disposed", async () => {
    const scope = createScope({
      tags: [siteConfig(unitSite), ventDriver(servoDriver)],
    })
    const bus = await scope.resolve(connection)
    expect(bus.isOpen()).toBe(true)
    await scope.dispose()
    expect(bus.isOpen()).toBe(false)
  })
})
