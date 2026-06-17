#!/usr/bin/env node

import { scanPaths, type Diagnostic } from "./index"

interface CliArgs {
  paths: string[]
  json: boolean
  help: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const paths: string[] = []
  let json = false
  let help = false

  for (const arg of argv) {
    if (arg === "--json") {
      json = true
    } else if (arg === "--help" || arg === "-h") {
      help = true
    } else {
      paths.push(arg)
    }
  }

  return { paths, json, help }
}

function usage(): string {
  return [
    "Usage: pumped-lite-lint [--json] [paths...]",
    "",
    "Scans @pumped-fn/lite and @pumped-fn/lite-react source for documented anti-patterns.",
  ].join("\n")
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  return `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.ruleId} ${diagnostic.message}`
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const result = await scanPaths(args.paths)
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

  if (result.diagnostics.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
