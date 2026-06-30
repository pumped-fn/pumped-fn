#!/usr/bin/env node

import { spawn } from "node:child_process"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { writeFileSync } from "node:fs"
import { getCollector } from "./transforms/core-next-to-lite.js"
import { generateReport } from "./report/generator.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

interface CliArgs {
  targetPath: string
  dry: boolean
  verbose: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const flags = args.filter((arg) => arg.startsWith("--"))
  const positional = args.filter((arg) => !arg.startsWith("--"))

  return {
    targetPath: positional[0] || ".",
    dry: flags.includes("--dry"),
    verbose: flags.includes("--verbose"),
  }
}

function runJscodeshift(args: CliArgs): Promise<number> {
  return new Promise((resolve, reject) => {
    const transformPath = join(__dirname, "transforms", "core-next-to-lite.mjs")
    const jscodeshiftArgs = [
      "-t",
      transformPath,
      args.targetPath,
      "--parser=tsx",
      "--extensions=ts,tsx,js,jsx",
    ]

    if (args.dry) {
      jscodeshiftArgs.push("--dry")
    }

    if (args.verbose) {
      jscodeshiftArgs.push("--verbose=2")
    }

    const child = spawn("jscodeshift", jscodeshiftArgs, {
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("close", (code) => resolve(code ?? 0))
  })
}

async function main(): Promise<void> {
  const args = parseArgs()

  console.log("🔄 Running codemod: @pumped-fn/core-next → @pumped-fn/lite")
  console.log("")

  const exitCode = await runJscodeshift(args)

  if (exitCode !== 0) {
    console.error("\n❌ Codemod failed with exit code:", exitCode)
    process.exit(exitCode)
  }

  if (!args.dry) {
    const collector = getCollector()
    const report = collector.getReport()
    const markdown = generateReport(report)
    const reportPath = resolve(process.cwd(), "migration-report.md")

    writeFileSync(reportPath, markdown, "utf-8")

    console.log("")
    console.log(`📄 Migration report saved to: ${reportPath}`)
    console.log("")
    console.log("✅ Migration complete!")
    console.log(`   Files processed: ${report.stats.filesProcessed}`)
    console.log(`   Patterns transformed: ${report.stats.patternsTransformed}`)
    console.log(`   Warnings: ${report.stats.patternsWarned}`)
    console.log(`   Manual review needed: ${report.edgeCases.length}`)
  } else {
    console.log("")
    console.log("ℹ️  Dry run complete - no files were modified")
  }
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
