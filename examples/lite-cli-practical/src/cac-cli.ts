import { cac, type CAC } from "cac"
import { target, writeJson, type Write } from "./args"

export function cacCli(write: Write = console.log): CAC {
  const cli = cac("pumped-cac")

  cli
    .command("deploy <service>", "Build a deployment plan")
    .option("--target <target>", "Deployment target")
    .option("--dry-run", "Plan without changing state")
    .option("--actor <actor>", "Actor attached to telemetry")
    .action(async (service: string, options: { target: string; dryRun?: boolean; actor?: string }) => {
      const { deploy } = await import("./commands/deploy")
      writeJson(write, (await deploy({
        service,
        target: target(options.target),
        dryRun: options.dryRun === true,
        actor: options.actor,
      })).output)
    })

  cli
    .command("audit", "Summarize release readiness")
    .option("--json", "Select JSON output mode")
    .option("--actor <actor>", "Actor attached to telemetry")
    .action(async (options: { json?: boolean; actor?: string }) => {
      const { audit } = await import("./commands/audit")
      writeJson(write, (await audit({
        json: options.json === true,
        actor: options.actor,
      })).output)
    })

  cli.help()
  return cli
}
