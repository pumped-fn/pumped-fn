import yargs, { type Argv } from "yargs"
import { target, writeJson, type Write } from "./args"

interface DeployArgs {
  service: string
  target: string
  dryRun?: boolean
  actor?: string
}

interface AuditArgs {
  json?: boolean
  actor?: string
}

export function yargsCli(write: Write = console.log): Argv {
  return yargs()
    .scriptName("pumped-yargs")
    .exitProcess(false)
    .command(
      "deploy <service>",
      "Build a deployment plan",
      (cmd) => cmd
        .positional("service", { type: "string", demandOption: true })
        .option("target", { type: "string", choices: ["staging", "production"], demandOption: true })
        .option("dry-run", { type: "boolean", default: false })
        .option("actor", { type: "string" }),
      async (argv) => {
        const { deploy } = await import("./commands/deploy")
        const args = argv as DeployArgs
        writeJson(write, (await deploy({
          service: args.service,
          target: target(args.target),
          dryRun: args.dryRun === true,
          actor: args.actor,
        })).output)
      },
    )
    .command(
      "audit",
      "Summarize release readiness",
      (cmd) => cmd
        .option("json", { type: "boolean", default: false })
        .option("actor", { type: "string" }),
      async (argv) => {
        const { audit } = await import("./commands/audit")
        const args = argv as AuditArgs
        writeJson(write, (await audit({
          json: args.json === true,
          actor: args.actor,
        })).output)
      },
    )
    .strict()
    .help()
}
