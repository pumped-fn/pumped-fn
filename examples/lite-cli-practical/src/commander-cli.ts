import { Command } from "commander"
import { target, writeJson, type Write } from "./args"

export function commanderCli(write: Write = console.log): Command {
  const program = new Command()

  program
    .name("pumped-commander")
    .exitOverride()
    .configureOutput({
      writeOut: (value) => write(value.trimEnd()),
      writeErr: (value) => write(value.trimEnd()),
    })

  program
    .command("deploy")
    .argument("<service>")
    .requiredOption("--target <target>")
    .option("--dry-run")
    .option("--actor <actor>")
    .action(async (service: string, options: { target: string; dryRun?: boolean; actor?: string }) => {
      const { deploy } = await import("./commands/deploy")
      writeJson(write, (await deploy({
        service,
        target: target(options.target),
        dryRun: options.dryRun === true,
        actor: options.actor,
      })).output)
    })

  program
    .command("audit")
    .option("--json")
    .option("--actor <actor>")
    .action(async (options: { json?: boolean; actor?: string }) => {
      const { audit } = await import("./commands/audit")
      writeJson(write, (await audit({
        json: options.json === true,
        actor: options.actor,
      })).output)
    })

  return program
}
