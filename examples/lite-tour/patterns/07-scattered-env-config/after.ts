import { atom, flow, tag, tags } from "@pumped-fn/lite"

export interface AppConfig {
  readonly baseUrl: string
  readonly port: number
}

export type LogLevel = "info" | "debug"

function parseAppConfig(raw: unknown): AppConfig {
  if (typeof raw !== "object") throw new Error("app config must be an object")
  if (raw === null) throw new Error("app config must be an object")

  const config = raw as {
    readonly baseUrl?: unknown
    readonly port?: unknown
  }

  if (!Number.isInteger(config.port)) throw new Error("port must be an integer")
  if (typeof config.baseUrl !== "string") throw new Error("baseUrl must be a string")
  if (!config.baseUrl.startsWith("https://")) throw new Error("baseUrl must use https")

  return {
    baseUrl: config.baseUrl,
    port: config.port as number,
  }
}

export const appConfig = tag<AppConfig>({
  label: "app.config",
  parse: parseAppConfig,
})

export const logLevel = tag<LogLevel>({
  label: "app.log.level",
  default: "info",
})

export const configSummary = atom({
  deps: {
    config: tags.required(appConfig),
    logLevel: tags.required(logLevel),
  },
  factory: (_, { config, logLevel }) => ({
    endpoint: `${config.baseUrl}:${config.port}`,
    logLevel,
  }),
})

export const requestConfig = flow({
  name: "p07.request-config",
  deps: { config: tags.required(appConfig) },
  factory: (_, { config }) => ({
    endpoint: `${config.baseUrl}:${config.port}`,
  }),
})
