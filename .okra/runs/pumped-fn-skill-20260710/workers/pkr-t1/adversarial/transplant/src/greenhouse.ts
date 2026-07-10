import { atom, controller, flow, tag, tags, typed } from "@pumped-fn/lite"

export interface SiteConfig {
  siteName: string
  ventTargetC: number
  alertThresholdC: number
}

export interface VentDriver {
  kind: string
  plan(aperturePct: number): { command: string; applied: number }
}

export const siteConfig = tag<SiteConfig>({ label: "site.config" })

export const ventDriver = tag<VentDriver>({ label: "vent.driver" })

const clampAperture = (aperturePct: number) =>
  Math.max(0, Math.min(100, Math.round(aperturePct)))

export const servoDriver: VentDriver = Object.freeze({
  kind: "servo",
  plan: (aperturePct: number) => {
    const applied = clampAperture(aperturePct)
    return { command: `servo:set:${applied}`, applied }
  },
})

export const stepperDriver: VentDriver = Object.freeze({
  kind: "stepper",
  plan: (aperturePct: number) => {
    const applied = Math.min(100, Math.round(clampAperture(aperturePct) / 10) * 10)
    return { command: `stepper:step:${applied}`, applied }
  },
})

export const connection = atom({
  factory: (ctx) => {
    const log: string[] = []
    let open = true
    ctx.cleanup(() => {
      open = false
    })
    return {
      send: (command: string) => {
        log.push(command)
      },
      sent: () => [...log],
      isOpen: () => open,
    }
  },
})

export const weatherService = atom({
  factory: () => ({
    fetchForecast: async (_siteName: string) => ({ highC: 24 }),
  }),
})

export const readings = atom({
  factory: (): { temperatureC: number } | null => null,
})

export const captureReading = flow({
  name: "capture-reading",
  parse: typed<{ temperatureC: number }>(),
  deps: { readings: controller(readings, { resolve: true }) },
  factory: (ctx, { readings }) => {
    readings.set({ temperatureC: ctx.input.temperatureC })
    return { temperatureC: ctx.input.temperatureC }
  },
})

export const status = atom({
  deps: {
    readings: controller(readings, { resolve: true, watch: true }),
    site: tags.required(siteConfig),
  },
  factory: (_ctx, { readings, site }) => {
    const reading = readings.get()
    if (reading === null) {
      return { siteName: site.siteName, level: "no-data" as const, temperatureC: null }
    }
    const level =
      reading.temperatureC >= site.alertThresholdC ? ("alert" as const) : ("ok" as const)
    return { siteName: site.siteName, level, temperatureC: reading.temperatureC }
  },
})

export const workRecord = atom({
  factory: (): { entries: string[] } => ({ entries: [] }),
})

export const planVentChange = flow({
  name: "vent.plan",
  parse: typed<{ temperatureC: number }>(),
  deps: { record: controller(workRecord, { resolve: true }), site: tags.required(siteConfig) },
  factory: (ctx, { record, site }) => {
    const excess = ctx.input.temperatureC - site.ventTargetC
    const aperturePct = excess <= 0 ? 0 : Math.min(100, Math.round(excess * 10))
    record.get().entries.push(`plan:${aperturePct}`)
    return { recorded: record.get().entries.length }
  },
})

export const applyVentChange = flow({
  name: "vent.apply",
  parse: typed<void>(),
  faults: typed<{ code: "NO_PLAN" }>(),
  deps: {
    record: controller(workRecord, { resolve: true }),
    driver: tags.required(ventDriver),
    connection,
  },
  factory: (ctx, { record, driver, connection }) => {
    const entries = record.get().entries
    const plans = entries.filter((entry) => entry.startsWith("plan:"))
    const latest = plans[plans.length - 1]
    if (latest === undefined) {
      return ctx.fail({ code: "NO_PLAN" })
    }
    const aperturePct = Number(latest.slice("plan:".length))
    const { command, applied } = driver.plan(aperturePct)
    connection.send(command)
    entries.push(`apply:${applied}`)
    return { applied, recorded: entries.length }
  },
})

export const runVentAdjustment = flow({
  name: "vent.adjust",
  parse: typed<{ temperatureC: number }>(),
  deps: {
    record: controller(workRecord, { resolve: true }),
    plan: controller(planVentChange),
    apply: controller(applyVentChange),
  },
  factory: async (ctx, { record, plan, apply }) => {
    await plan.exec({ input: { temperatureC: ctx.input.temperatureC } })
    const { applied } = await apply.exec()
    return { applied, log: [...record.get().entries] }
  },
})

export const fetchDailyOutlook = flow({
  name: "daily-outlook",
  parse: typed<void>(),
  deps: { weatherService, site: tags.required(siteConfig) },
  factory: async (ctx, { weatherService, site }) => {
    const forecast = await ctx.exec({
      name: "weather.fetchForecast",
      fn: () => weatherService.fetchForecast(site.siteName),
      params: [],
    })
    return { siteName: site.siteName, highC: forecast.highC }
  },
})
