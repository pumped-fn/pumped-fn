import { logging, type Logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { codex } from "@pumped-fn/sdk-codex"
import { databaseEngine, mailer, postgresDatabase, type Mailer } from "../src/invoice-runtime"
import type { DatabaseStartupMode } from "../src/invoice-migrations"

export interface RuntimeOptions {
  databaseUrl?: string
}

export function splitRuntimeArgs(argv: readonly string[]): { runtime: RuntimeOptions; rest: string[] } {
  const rest: string[] = []
  let databaseUrl: string | undefined
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!
    if (arg === "--database-url") {
      databaseUrl = argv[++index]
    } else {
      rest.push(arg)
    }
  }
  return { runtime: databaseUrl === undefined ? {} : { databaseUrl }, rest }
}

export function option(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

export function numberOption(argv: readonly string[], name: string, fallback: number): number {
  const value = option(argv, name)
  return value === undefined ? fallback : Number(value)
}

export function startupOption(value: string | undefined): DatabaseStartupMode | undefined {
  if (value === undefined) return undefined
  if (value === "migrate" || value === "verify") return value
  throw new Error(`Unsupported startup mode: ${value}`)
}

export function runtimeExtensions() {
  return [logging.extension()]
}

export function runtimeTags(options: RuntimeOptions) {
  const sink: Logging.Sink = {
    name: "stdout",
    write: (record) => console.log(JSON.stringify(record)),
  }
  const reminders: Mailer = {
    async send(message) {
      console.log(JSON.stringify({ event: "invoice.reminder", message }))
    },
  }
  return [
    scheduler.backend(scheduler.inProcess()),
    logging.runtime({
      sinks: [sink],
      level: "info",
      flow: "errors",
      fields: { service: "invoice-triage" },
    }),
    codex(),
    mailer(reminders),
    ...(options.databaseUrl === undefined ? [] : [
      databaseEngine(postgresDatabase({ connectionString: options.databaseUrl })),
    ]),
  ]
}
