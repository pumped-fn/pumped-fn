import { atom, controller, flow, resource, tag, tags, typed, type Lite } from "@pumped-fn/lite"

type SiteConfig = {
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

type VentResult = {
  command: string
  applied: number
}

type Reading = {
  temperatureC: number
}

export const siteConfig = tag<SiteConfig>({ label: "greenhouse.site-config" })

export const connection = atom({
  factory: (ctx) => {
    const commands: string[] = []
    let open = true
    ctx.cleanup(() => { open = false })
    return {
      send(command: string) { commands.push(command) },
      sent() { return [...commands] },
      isOpen() { return open },
    } satisfies Connection
  },
})

export const weatherService = atom({
  factory: () => ({
    async fetchForecast(_siteName: string) {
      return { highC: 25 }
    },
  }) satisfies WeatherService,
})

export const readings = atom({
  factory: () => ({ latest: null as Reading | null }),
})

export const status = atom({
  deps: {
    readings: controller(readings, { resolve: true, watch: true }),
    siteConfig: tags.required(siteConfig),
  },
  factory: (_ctx, { readings, siteConfig }) => {
    const latest = readings.get().latest
    return {
      siteName: siteConfig.siteName,
      level: latest === null ? "no-data" : latest.temperatureC >= siteConfig.alertThresholdC ? "alert" : "ok",
      temperatureC: latest?.temperatureC ?? null,
    } as const
  },
})

export const servoDriver = flow({
  name: "vent.servo",
  parse: typed<{ aperturePct: number }>(),
  factory: (ctx) => {
    const applied = Math.max(0, Math.min(100, Math.round(ctx.input.aperturePct)))
    return { command: `servo:set:${applied}`, applied } satisfies VentResult
  },
})

export const stepperDriver = flow({
  name: "vent.stepper",
  parse: typed<{ aperturePct: number }>(),
  factory: (ctx) => {
    const clamped = Math.max(0, Math.min(100, ctx.input.aperturePct))
    const applied = Math.round(clamped / 10) * 10
    return { command: `stepper:step:${applied}`, applied } satisfies VentResult
  },
})

export const ventDriver = tag<Lite.Flow<VentResult, { aperturePct: number }>>({ label: "greenhouse.vent-driver" })

const workRecord = resource({
  name: "vent-work-record",
  ownership: "current",
  factory: () => ({ entries: [] as string[] }),
})

export const captureReading = flow({
  name: "reading.capture",
  parse: typed<Reading>(),
  deps: { readings: controller(readings, { resolve: true }) },
  factory: (ctx, { readings }) => {
    readings.set({ latest: { temperatureC: ctx.input.temperatureC } })
    return { temperatureC: ctx.input.temperatureC }
  },
})

export const planVentChange = flow({
  name: "vent.plan",
  parse: typed<Reading>(),
  deps: { siteConfig: tags.required(siteConfig), workRecord },
  factory: (ctx, { siteConfig, workRecord }) => {
    const aperturePct = ctx.input.temperatureC <= siteConfig.ventTargetC
      ? 0
      : Math.min(100, Math.round((ctx.input.temperatureC - siteConfig.ventTargetC) * 10))
    workRecord.entries.push(`plan:${aperturePct}`)
    return { recorded: workRecord.entries.length }
  },
})

export const applyVentChange = flow({
  name: "vent.apply",
  deps: {
    connection,
    ventDriver: tags.required(ventDriver),
    workRecord,
  },
  faults: typed<{ code: "NO_PLAN" }>(),
  factory: async (ctx, { connection, ventDriver, workRecord }) => {
    const planned = [...workRecord.entries].reverse().find(entry => entry.startsWith("plan:"))
    if (planned === undefined) return ctx.fail({ code: "NO_PLAN" })
    const aperturePct = Number(planned.slice("plan:".length))
    const result = await ventDriver.exec({ input: { aperturePct } })
    await ctx.exec({ fn: (_execution, command) => connection.send(command), params: [result.command], name: "controllerBus.send" })
    workRecord.entries.push(`apply:${result.applied}`)
    return { applied: result.applied, recorded: workRecord.entries.length }
  },
})

export const runVentAdjustment = flow({
  name: "vent.adjust",
  parse: typed<Reading>(),
  deps: {
    applyVentChange: controller(applyVentChange),
    planVentChange: controller(planVentChange),
    workRecord,
  },
  factory: async (ctx, { applyVentChange, planVentChange, workRecord }) => {
    await planVentChange.exec({ input: { temperatureC: ctx.input.temperatureC } })
    const { applied } = await applyVentChange.exec()
    return { applied, log: [...workRecord.entries] }
  },
})

export const fetchDailyOutlook = flow({
  name: "weather.daily-outlook",
  deps: { siteConfig: tags.required(siteConfig), weatherService },
  factory: async (ctx, { siteConfig, weatherService }) => {
    const forecast = await ctx.exec({
      fn: (_execution, siteName) => weatherService.fetchForecast(siteName),
      params: [siteConfig.siteName],
      name: "weather.fetchForecast",
    })
    return { siteName: siteConfig.siteName, highC: forecast.highC }
  },
})
