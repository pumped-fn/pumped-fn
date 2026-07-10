import { atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/lite"

export type SiteConfig = {
  siteName: string
  ventTargetC: number
  alertThresholdC: number
}

type Connection = {
  send(command: string): void
  sent(): string[]
  isOpen(): boolean
}

type WeatherService = {
  fetchForecast(siteName: string): Promise<{ highC: number }>
}

type VentDriver = {
  kind: "servo" | "stepper"
  apply(aperturePct: number): { command: string; applied: number }
}

type WorkRecord = {
  log: string[]
}

export const siteConfig = tag<SiteConfig>({ label: "greenhouse.site-config" })
export const ventDriver = tag<VentDriver>({ label: "greenhouse.vent-driver" })

function clamp(aperturePct: number) {
  return Math.max(0, Math.min(100, aperturePct))
}

export const servoDriver = {
  kind: "servo",
  apply: (aperturePct: number) => {
    const applied = clamp(Math.round(aperturePct))
    return { command: `servo:set:${applied}`, applied }
  },
} satisfies VentDriver

export const stepperDriver = {
  kind: "stepper",
  apply: (aperturePct: number) => {
    const applied = clamp(Math.round(clamp(aperturePct) / 10) * 10)
    return { command: `stepper:step:${applied}`, applied }
  },
} satisfies VentDriver

export const connection = atom({
  factory: (ctx) => {
    const commands: string[] = []
    let open = true
    ctx.cleanup(() => { open = false })
    return {
      send: (command: string) => { commands.push(command) },
      sent: () => [...commands],
      isOpen: () => open,
    } satisfies Connection
  },
})

export const weatherService = atom({
  factory: () => ({
    fetchForecast: async (_siteName: string) => ({ highC: 24 }),
  }) satisfies WeatherService,
})

export const readings = atom({
  keepAlive: true,
  factory: () => ({ temperatureC: null as number | null }),
})

export const status = atom({
  deps: {
    site: tags.required(siteConfig),
    readings: controller(readings, { resolve: true, watch: true }),
  },
  factory: (_ctx, { site, readings }) => {
    const temperatureC = readings.get().temperatureC
    const level = temperatureC === null
      ? "no-data"
      : temperatureC >= site.alertThresholdC ? "alert" : "ok"
    return { siteName: site.siteName, level, temperatureC }
  },
})

const workRecord = resource({
  name: "vent-work-record",
  ownership: "current",
  factory: () => ({ log: [] as string[] }) satisfies WorkRecord,
})

export const captureReading = flow({
  name: "reading.capture",
  parse: typed<{ temperatureC: number }>(),
  deps: { readings: controller(readings, { resolve: true }) },
  factory: (ctx, { readings }) => {
    readings.set({ temperatureC: ctx.input.temperatureC })
    return { temperatureC: ctx.input.temperatureC }
  },
})

export const planVentChange = flow({
  name: "vent.plan",
  parse: typed<{ temperatureC: number }>(),
  deps: { site: tags.required(siteConfig), workRecord },
  factory: (ctx, { site, workRecord }) => {
    const aperturePct = ctx.input.temperatureC <= site.ventTargetC
      ? 0
      : Math.min(100, Math.round((ctx.input.temperatureC - site.ventTargetC) * 10))
    workRecord.log.push(`plan:${aperturePct}`)
    return { recorded: workRecord.log.length }
  },
})

function latestPlan(log: string[]) {
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const entry = log[index]
    if (entry.startsWith("plan:")) return Number(entry.slice("plan:".length))
  }
  return undefined
}

export const applyVentChange = flow({
  name: "vent.apply",
  parse: typed<void>(),
  faults: typed<{ code: "NO_PLAN" }>(),
  deps: {
    connection,
    driver: tags.required(ventDriver),
    workRecord,
  },
  factory: (ctx, { connection, driver, workRecord }) => {
    const aperturePct = latestPlan(workRecord.log)
    if (aperturePct === undefined) return ctx.fail({ code: "NO_PLAN" })
    const { command, applied } = driver.apply(aperturePct)
    connection.send(command)
    workRecord.log.push(`apply:${applied}`)
    return { applied, recorded: workRecord.log.length }
  },
})

export const runVentAdjustment = flow({
  name: "vent.adjust",
  parse: typed<{ temperatureC: number }>(),
  deps: {
    workRecord,
    planVentChange: controller(planVentChange, { name: "vent.plan" }),
    applyVentChange: controller(applyVentChange, { name: "vent.apply" }),
  },
  factory: async (ctx, { workRecord, planVentChange, applyVentChange }) => {
    await planVentChange.exec({ input: ctx.input })
    const { applied } = await applyVentChange.exec()
    return { applied, log: [...workRecord.log] }
  },
})

export const fetchDailyOutlook = flow({
  name: "weather.daily-outlook",
  parse: typed<void>(),
  deps: { site: tags.required(siteConfig), weatherService },
  factory: async (ctx, { site, weatherService }) => {
    const { highC } = await ctx.exec({
      fn: (_ctx, siteName: string) => weatherService.fetchForecast(siteName),
      params: [site.siteName],
      name: "weather.fetchForecast",
    })
    return { siteName: site.siteName, highC }
  },
})
