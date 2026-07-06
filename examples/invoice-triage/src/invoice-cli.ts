import { createScope, type Lite } from "@pumped-fn/lite"
import { cac } from "cac"
import { readFile } from "node:fs/promises"
import { prepareDatabase } from "./invoice-database-operations"
import { enqueue, intake, listAuditEvents } from "./invoice-intake"
import { dailyReport } from "./invoice-reporting"
import { databaseStartup, intakeLines } from "./invoice-runtime"
import type { DatabaseStartupMode } from "./invoice-migrations"

export interface CliIo {
  out(line: string): void
  err(line: string): void
}

export interface CliOptions {
  extensions?: readonly Lite.Extension[]
  tags?: readonly Lite.Tagged<any>[]
}

export async function runCli(argv: readonly string[], io: CliIo, options: CliOptions = {}): Promise<number> {
  let code = 0
  const scope = createScope({
    extensions: options.extensions === undefined ? undefined : [...options.extensions],
    tags: options.tags === undefined ? undefined : [...options.tags],
  })
  const program = cac("invoice-triage")

  program
    .command("migrate", "Apply or verify database migrations")
    .option("--mode <mode>", "migrate | verify", { default: "migrate" })
    .action(async (args: { mode?: string }) => {
      io.out(JSON.stringify(await exec(scope, prepareDatabase, undefined, [databaseStartup(startupMode(args.mode))])))
    })

  program
    .command("enqueue", "Append invoice work to the durable pending queue")
    .option("--json <json>", "Invoice, invoice array, or { invoices } payload")
    .action(async (args: { json?: string }) => {
      io.out(JSON.stringify(await exec(scope, enqueue, parseJson(args.json))))
    })

  program
    .command("import <file>", "Import NDJSON invoices from a file")
    .action(async (file: string) => {
      const lines = await fileLines(file)
      io.out(JSON.stringify(await exec(scope, intake, undefined, [intakeLines(lines)])))
    })

  program
    .command("report", "Render the current daily report")
    .action(async () => {
      io.out(JSON.stringify(await exec(scope, dailyReport)))
    })

  program
    .command("audit", "List audit events")
    .action(async () => {
      io.out(JSON.stringify(await exec(scope, listAuditEvents)))
    })

  try {
    program.parse(["node", "invoice-triage", ...argv], { run: false })
    await program.runMatchedCommand()
  } catch (error) {
    code = 1
    io.err(error instanceof Error ? error.message : String(error))
  } finally {
    await scope.dispose()
  }

  return code
}

async function exec<Output, Input>(
  scope: Lite.Scope,
  flow: Lite.Flow<Output, Input, any, any>,
  rawInput?: unknown,
  tags: readonly Lite.Tagged<any>[] = []
): Promise<Output> {
  const ctx = scope.createContext({ tags: [...tags] })
  try {
    const output = await ctx.exec({ flow, rawInput })
    await ctx.close({ ok: true })
    return output
  } catch (error) {
    await ctx.close({ ok: false, error })
    throw error
  }
}

function startupMode(value: string | undefined): DatabaseStartupMode {
  if (value === undefined || value === "migrate") return "migrate"
  if (value === "verify") return "verify"
  throw new Error(`Unsupported migration mode: ${value}`)
}

function parseJson(value: string | undefined): unknown {
  if (value === undefined) throw new Error("Missing --json payload")
  return JSON.parse(value)
}

async function fileLines(path: string): Promise<AsyncIterable<string>> {
  return lines((await readFile(path, "utf8")).split(/\r?\n/))
}

async function* lines(items: readonly string[]): AsyncIterable<string> {
  yield* items
}
