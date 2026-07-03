import { createScope } from "@pumped-fn/lite"
import { cac } from "cac"
import { command } from "../tags"
import { normalizeApp, type Manifest, type ManifestEntry } from "./manifest"

function resolveCommand(entry: ManifestEntry): { name: string; description: string | undefined } {
  const meta = command.find(entry.meta ? [entry.meta] : []) ?? command.find(entry.flow!)
  return {
    name: meta?.name ?? entry.name,
    description: meta?.description,
  }
}

export interface CliIo {
  out(line: string): void
  err(line: string): void
}

/**
 * Runs the manifest's cli entries. On a flow failure mapped by `appConfig.mapError`,
 * the mapped body is rendered to `err()` and `process.exitCode` is derived from the
 * mapped status: 403 -> 3, 409 -> 4, 404 -> 5, anything else -> 1. Unmapped failures
 * keep the prior behavior of printing the error message and exiting with code 1.
 */
export async function runCli(manifest: Manifest, argv: string[], io?: CliIo): Promise<void> {
  const appConfig = normalizeApp(manifest.app)
  const out = io?.out ?? ((line: string) => process.stdout.write(`${line}\n`))
  const err = io?.err ?? ((line: string) => process.stderr.write(`${line}\n`))
  const program = cac("pumped")

  async function runEntry(entry: ManifestEntry, json: string | undefined): Promise<void> {
    let rawInput: unknown
    if (json) {
      try {
        rawInput = JSON.parse(json)
      } catch (error) {
        err(`invalid --json payload: ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
        return
      }
    }

    const scope = createScope({
      extensions: appConfig.extensions,
      tags: appConfig.tags,
      presets: appConfig.presets,
    })
    const context = scope.createContext({ tags: appConfig.context() })

    try {
      const output = await context.exec({ flow: entry.flow!, rawInput })
      out(JSON.stringify(output))
      await context.close({ ok: true })
    } catch (error) {
      await context.close({ ok: false, error })
      const mapped = appConfig.mapError?.(error)
      if (mapped === undefined) {
        err(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      } else {
        err(JSON.stringify(mapped.body))
        process.exitCode = mapped.status === 403 ? 3 : mapped.status === 409 ? 4 : mapped.status === 404 ? 5 : 1
      }
    } finally {
      await scope.dispose()
    }
  }

  for (const entry of manifest.entries.filter((entry) => entry.kind === "cli")) {
    const { name, description } = resolveCommand(entry)

    program
      .command(name, description)
      .option("--json <json>", "JSON payload for the command input")
      .action((options: { json?: string }) => runEntry(entry, options.json))
  }

  const agentEntries = manifest.entries.filter((entry) => entry.kind === "agents")
  if (agentEntries.length > 0) {
    program
      .command("agent <name>", "Run an agents/ turn flow")
      .option("--json <json>", "JSON payload for the turn input")
      .action((name: string, options: { json?: string }) => {
        const entry = agentEntries.find((entry) => entry.name === name)
        if (!entry) throw new Error(`No agent named "${name}"`)
        return runEntry(entry, options.json)
      })
  }

  program.parse(["node", "pumped", ...argv], { run: false })
  await program.runMatchedCommand()
}
