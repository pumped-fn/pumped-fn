import { describe, expect, test } from "vitest"
import { cacCli } from "../src/cac-cli"
import { commanderCli } from "../src/commander-cli"
import { yargsCli } from "../src/yargs-cli"

function writer(): [string[], (line: string) => void] {
  const lines: string[] = []
  return [lines, (line) => lines.push(line)]
}

function read<T>(lines: string[]): T {
  return JSON.parse(lines[0]!) as T
}

describe("command libraries", () => {
  test("Commander runs a lazy deployment action", async () => {
    const [lines, write] = writer()

    await commanderCli(write).parseAsync(["deploy", "api", "--target", "staging", "--dry-run", "--actor", "ci"], {
      from: "user",
    })

    expect(read(lines)).toMatchObject({
      operation: "deploy",
      actor: "ci",
      service: "api",
      target: "staging",
      dryRun: true,
    })
  })

  test("Yargs runs a lazy audit action", async () => {
    const [lines, write] = writer()

    await yargsCli(write).parseAsync(["audit", "--json", "--actor", "ci"])

    expect(read(lines)).toMatchObject({
      operation: "audit",
      actor: "ci",
      format: "json",
      risky: 1,
    })
  })

  test("CAC runs a lazy deployment action", async () => {
    const [lines, write] = writer()
    const cli = cacCli(write)

    cli.parse(["node", "test", "deploy", "worker", "--target", "production"], { run: false })
    await cli.runMatchedCommand()

    expect(read(lines)).toMatchObject({
      operation: "deploy",
      actor: "local",
      service: "worker",
      target: "production",
      next: "4.3.0-rc.1",
    })
  })
})
