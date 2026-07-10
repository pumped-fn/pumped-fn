import { createScope, preset, type Lite } from "@pumped-fn/lite"
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

const site = { siteName: "north", ventTargetC: 20, alertThresholdC: 25 }

describe("greenhouse control plane", () => {
  it("routes an adjustment through the selected driver and preset connection", async () => {
    const commands: string[] = []
    const scope = createScope({
      presets: [preset(connection, {
        send: (command: string) => { commands.push(command) },
        sent: () => [...commands],
        isOpen: () => true,
      })],
      tags: [siteConfig(site), ventDriver(stepperDriver)],
    })
    const session = scope.createContext()
    await expect(session.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } })).resolves.toEqual({
      applied: 30,
      log: ["plan:34", "apply:30"],
    })
    expect(commands).toEqual(["stepper:step:30"])
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("derives status from readings and requires site configuration", async () => {
    const scope = createScope({ tags: [siteConfig(site)] })
    const session = scope.createContext()
    await expect(scope.resolve(status)).resolves.toEqual({
      siteName: "north",
      level: "no-data",
      temperatureC: null,
    })
    await session.exec({ flow: captureReading, input: { temperatureC: 25 } })
    await scope.flush()
    await expect(scope.resolve(status)).resolves.toEqual({
      siteName: "north",
      level: "alert",
      temperatureC: 25,
    })
    await session.close({ ok: true })
    await scope.dispose()

    const missingScope = createScope()
    await expect(missingScope.resolve(status)).rejects.toThrow(/site/i)
    await missingScope.dispose()
  })

  it("keeps work records private and reports an unplanned apply as a fault", async () => {
    const scope = createScope({ tags: [siteConfig(site), ventDriver(stepperDriver)] })
    const session = scope.createContext()
    await expect(session.exec({ flow: planVentChange, input: { temperatureC: 21 } })).resolves.toEqual({ recorded: 1 })
    await expect(session.exec({ flow: planVentChange, input: { temperatureC: 22 } })).resolves.toEqual({ recorded: 1 })
    await expect(session.exec({ flow: applyVentChange })).rejects.toSatisfy(error =>
      error instanceof Error && JSON.stringify(error).includes("NO_PLAN"),
    )
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("isolates concurrent adjustments and rejects a composition without a driver", async () => {
    const scope = createScope({ tags: [siteConfig(site), ventDriver(stepperDriver)] })
    const session = scope.createContext()
    const [cool, warm] = await Promise.all([
      session.exec({ flow: runVentAdjustment, input: { temperatureC: 21 } }),
      session.exec({ flow: runVentAdjustment, input: { temperatureC: 28 } }),
    ])
    expect(cool.log).toEqual(["plan:10", "apply:10"])
    expect(warm.log).toEqual(["plan:80", "apply:80"])
    await session.close({ ok: true })
    await scope.dispose()

    const driverlessScope = createScope({ tags: [siteConfig(site)] })
    const driverlessSession = driverlessScope.createContext()
    let failure: unknown
    try {
      await driverlessSession.exec({ flow: runVentAdjustment, input: { temperatureC: 21 } })
    } catch (error) {
      failure = error
    }
    expect(String(failure)).toMatch(/vent-driver/i)
    await driverlessSession.close({ ok: false, error: failure })
    await driverlessScope.dispose()
  })

  it("exposes child steps and foreign weather calls to extensions", async () => {
    const seen: string[] = []
    const tracing: Lite.Extension = {
      name: "trace",
      async wrapExec(next, target, ctx) {
        seen.push(ctx.name ?? target.name ?? "unnamed")
        return next()
      },
    }
    const scope = createScope({
      presets: [preset(weatherService, {
        fetchForecast: async (siteName: string) => ({ highC: siteName.length }),
      })],
      tags: [siteConfig(site), ventDriver(stepperDriver)],
      extensions: [tracing],
    })
    const session = scope.createContext()
    await session.exec({ flow: runVentAdjustment, input: { temperatureC: 23 } })
    await expect(session.exec({ flow: fetchDailyOutlook })).resolves.toEqual({ siteName: "north", highC: 5 })
    expect(seen).toContain("vent.plan")
    expect(seen).toContain("vent.apply")
    expect(seen).toContain("weather.fetchForecast")
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("closes the default connection when its composition shuts down", async () => {
    const scope = createScope()
    const bus = await scope.resolve(connection)
    expect(bus.isOpen()).toBe(true)
    await scope.dispose()
    expect(bus.isOpen()).toBe(false)
  })
})
