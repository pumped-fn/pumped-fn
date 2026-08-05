import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CliWorkerError,
  ModelResponseParseError,
  parseModelResponse,
  runCli,
} from "../src/index"

describe("model response parsing", () => {
  it("accepts one response object embedded in surrounding prose", () => {
    const response = {
      content: 'literal { brace }, quote: ", slash: \\',
      meta: { nested: { value: 1 } },
      stop: false,
    }

    expect(parseModelResponse(`prefix ${JSON.stringify(response)} suffix`)).toEqual({
      content: response.content,
      stop: false,
    })
  })

  it("rejects empty, malformed, and non-response output", () => {
    for (const output of [
      "",
      '{"content":"unterminated"',
      '{"content":42}',
      '{"stop":false}',
      "plain provider prose",
    ]) {
      expect(() => parseModelResponse(output)).toThrow(ModelResponseParseError)
    }
  })

  it("rejects multiple response-shaped objects instead of selecting a tool-call example", () => {
    const output = [
      'Tool-call example: {"content":"EXAMPLE ONLY","toolCalls":[{"name":"inspect"}]}',
      'Real response: {"content":"REAL ANSWER","stop":true}',
    ].join("\n")

    expect(() => parseModelResponse(output)).toThrow(ModelResponseParseError)
  })
})

describe("CLI cleanup", () => {
  it("keeps CliWorkerError primary and exposes the cleanup failure", async () => {
    const success = await cleanupFailure("success")
    const failure = await cleanupFailure("exit-7")

    expect(success).toMatchObject({ code: "EACCES" })
    expect(success).not.toBeInstanceOf(CliWorkerError)
    expect(failure).toBeInstanceOf(CliWorkerError)
    expect(failure).toMatchObject({
      message: "CLI command failed with exit code 7",
      result: { exitCode: 7 },
      cleanupError: { code: "EACCES" },
    })
  })
})

async function cleanupFailure(command: string): Promise<unknown> {
  const root = await mkdtemp(join(tmpdir(), "pumped-adversarial-cleanup-"))
  const executable = join(root, "fake-bwrap.mjs")
  const marker = join(root, "home-path")
  await writeFile(executable, `#!/usr/bin/env node
import { chmodSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2)
const bind = args.findIndex((value, index) => value === "--bind" && args[index + 2] === "/home/agent")
const home = args[bind + 1]
writeFileSync(${JSON.stringify(marker)}, home)
writeFileSync(home + "/blocked", "blocked")
chmodSync(home, 0)
if (args.includes("exit-7")) process.exitCode = 7
else process.stdout.write("ready")
`)
  await chmod(executable, 0o755)
  let result: unknown
  try {
    result = await runCli({ command, isolate: { bwrap: executable } })
  } catch (error) {
    result = error
  } finally {
    const home = await readFile(marker, "utf8")
    await chmod(home, 0o700)
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
  return result
}
