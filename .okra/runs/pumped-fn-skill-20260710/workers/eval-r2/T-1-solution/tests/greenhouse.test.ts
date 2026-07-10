import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  applyVentChange,
  captureReading,
  connection,
  fetchDailyOutlook,
  planVentChange,
  runVentAdjustment,
  siteConfig,
  status,
  stepperDriver,
  ventDriver,
  weatherService,
} from "../src/greenhouse.js"

describe("greenhouse control", () => {
  it("uses a substituted shared connection and isolates adjustment logs", async () => {
    const commands: string[] = []
    const executions: string[] = []
    const bus = {
      send(command: string) { commands.push(command) },
      sent() { return [...commands] },
      isOpen() { return true },
    }
    const scope = createScope({
      presets: [preset(connection, bus)],
      tags: [siteConfig({ siteName: "north", ventTargetC: 20, alertThresholdC: 24 }), ventDriver(stepperDriver)],
      extensions: [{
        name: "record-executions",
        async wrapExec(next, target, ctx) {
          executions.push(ctx.name ?? target.name ?? "unnamed")
          return next()
        },
      }],
    })
    const session = scope.createContext()
    const first = session.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } })
    const second = session.exec({ flow: runVentAdjustment, input: { temperatureC: 31 } })
    await expect(first).resolves.toEqual({ applied: 30, log: ["plan:34", "apply:30"] })
    await expect(second).resolves.toEqual({ applied: 100, log: ["plan:100", "apply:100"] })
    expect(commands.sort()).toEqual(["stepper:step:100", "stepper:step:30"])
    expect(executions).toContain("vent.plan")
    expect(executions).toContain("vent.apply")
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("derives status from readings", async () => {
    const scope = createScope({
      tags: [siteConfig({ siteName: "north", ventTargetC: 20, alertThresholdC: 24 }), ventDriver(stepperDriver)],
    })
    const session = scope.createContext()
    await expect(scope.resolve(status)).resolves.toEqual({ siteName: "north", level: "no-data", temperatureC: null })
    await session.exec({ flow: captureReading, input: { temperatureC: 24 } })
    await scope.flush()
    await expect(scope.resolve(status)).resolves.toEqual({ siteName: "north", level: "alert", temperatureC: 24 })
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("fails an unplanned apply and gives standalone plans fresh records", async () => {
    const scope = createScope({
      tags: [siteConfig({ siteName: "north", ventTargetC: 20, alertThresholdC: 24 }), ventDriver(stepperDriver)],
    })
    const session = scope.createContext()
    await expect(session.exec({ flow: applyVentChange })).rejects.toMatchObject({ fault: { code: "NO_PLAN" } })
    await expect(session.exec({ flow: planVentChange, input: { temperatureC: 21 } })).resolves.toEqual({ recorded: 1 })
    await expect(session.exec({ flow: planVentChange, input: { temperatureC: 22 } })).resolves.toEqual({ recorded: 1 })
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("uses a preset weather service through a named edge", async () => {
    const calls: string[] = []
    const executions: string[] = []
    const scope = createScope({
      presets: [preset(weatherService, { async fetchForecast(siteName: string) { calls.push(siteName); return { highC: 29 } } })],
      tags: [siteConfig({ siteName: "north", ventTargetC: 20, alertThresholdC: 24 }), ventDriver(stepperDriver)],
      extensions: [{
        name: "record-executions",
        async wrapExec(next, target, ctx) {
          executions.push(ctx.name ?? target.name ?? "unnamed")
          return next()
        },
      }],
    })
    const session = scope.createContext()
    await expect(session.exec({ flow: fetchDailyOutlook })).resolves.toEqual({ siteName: "north", highC: 29 })
    expect(calls).toEqual(["north"])
    expect(executions).toContain("weather.fetchForecast")
    await session.close({ ok: true })
    await scope.dispose()
  })
})
