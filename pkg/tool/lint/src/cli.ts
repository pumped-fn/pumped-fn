#!/usr/bin/env node

import { realpathSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { scanPaths, type Diagnostic, type RuleOptions } from "./index"

interface CliArgs {
  paths: string[]
  json: boolean
  help: boolean
  configPath: string | null
  maxWarnings: number | null
}

interface CliConfig {
  rules?: RuleOptions
  maxWarnings?: number
  compositionPaths?: string[]
}

function parseArgs(argv: string[]): CliArgs {
  const paths: string[] = []
  let json = false
  let help = false
  let configPath: string | null = null
  let maxWarnings: number | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "--json") {
      json = true
    } else if (arg === "--help" || arg === "-h") {
      help = true
    } else if (arg === "--config") {
      configPath = argv[++i] ?? null
    } else if (arg === "--max-warnings") {
      maxWarnings = Number(argv[++i])
    } else {
      paths.push(arg)
    }
  }

  return { paths, json, help, configPath, maxWarnings }
}

function usage(): string {
  return [
    "Usage: pumped-lite-lint [--json] [--config <path>] [--max-warnings <n>] [paths...]",
    "",
    "Scans @pumped-fn/lite and @pumped-fn/lite-react source for documented anti-patterns.",
    "",
    "--config <path>       JSON file with { rules, maxWarnings, compositionPaths } to override rule severities and extend the composition-root path convention.",
    "--max-warnings <n>    Fail the build once the warning count exceeds n (0 means any warning fails).",
  ].join("\n")
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  return `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} [${diagnostic.severity}] ${diagnostic.ruleId} ${diagnostic.message}`
}

async function loadConfig(configPath: string | null, cwd: string): Promise<CliConfig> {
  if (!configPath) return {}
  const contents = await readFile(resolve(cwd, configPath), "utf8")
  return JSON.parse(contents) as CliConfig
}

export async function main(argv = process.argv.slice(2), cwd = process.cwd()): Promise<void> {
  const args = parseArgs(argv)
  if (args.help) {
    console.log(usage())
    return
  }

  const config = await loadConfig(args.configPath, cwd)
  const maxWarnings = args.maxWarnings ?? config.maxWarnings ?? null

  const result = await scanPaths(args.paths, { cwd, rules: config.rules, compositionPaths: config.compositionPaths })
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.diagnostics.length === 0) {
    console.log(`pumped-lite-lint: ${result.filesScanned} files scanned, 0 diagnostics`)
  } else {
    for (const diagnostic of result.diagnostics) {
      console.log(formatDiagnostic(diagnostic))
    }
    console.log(`pumped-lite-lint: ${result.filesScanned} files scanned, ${result.diagnostics.length} diagnostics`)
  }

  const warningCount = result.diagnostics.filter((diagnostic) => diagnostic.severity === "warn").length
  const hasErrors = result.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  const exceedsMaxWarnings = maxWarnings !== null && warningCount > maxWarnings

  if (hasErrors || exceedsMaxWarnings) process.exitCode = 1
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : ""

if (fileURLToPath(import.meta.url) === invoked) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
