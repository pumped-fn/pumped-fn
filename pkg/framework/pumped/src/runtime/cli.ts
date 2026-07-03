import { createScope } from "@pumped-fn/lite"
import { cac } from "cac"
import { command } from "../tags"
import type { Manifest, ManifestEntry } from "./manifest"

function resolveCommand(entry: ManifestEntry): { name: string; description: string | undefined } {
  const meta = command.find(entry.flow)
  return {
    name: meta?.name ?? entry.name,
    description: meta?.description,
  }
}

export interface CliIo {
  out(line: string): void
  err(line: string): void
}

export async function runCli(manifest: Manifest, argv: string[], io?: CliIo): Promise<void> {
  const appConfig = manifest.app
  const out = io?.out ?? ((line: string) => process.stdout.write(`${line}\n`))
  const err = io?.err ?? ((line: string) => process.stderr.write(`${line}\n`))
  const program = cac("pumped")

  async function runEntry(entry: ManifestEntry, json: string | undefined): Promise<void> {
    const scope = createScope({
      extensions: appConfig?.extensions,
      tags: appConfig?.tags,
      presets: appConfig?.presets,
    })
    const context = scope.createContext({ tags: appConfig?.context?.() })
    const rawInput = json ? JSON.parse(json) : undefined

    try {
      const output = await context.exec({ flow: entry.flow, rawInput })
      out(JSON.stringify(output))
      await context.close({ ok: true })
    } catch (error) {
      await context.close({ ok: false, error })
      err(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
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
