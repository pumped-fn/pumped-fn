import { flow, tags, typed } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import * as sandbox from "@pumped-fn/sdk/sandbox"
import { spawnProcess, timers } from "./runtime.js"
import { TriageError } from "./triage.js"

export const process: sandbox.Run = flow({
  name: "issue-triage.process.run",
  parse: typed<sandbox.ExecInput>(),
  deps: { policy: tags.required(sandbox.policy), spawn: spawnProcess, timers },
  tags: [step({ workflow: true, kind: "sandbox" })],
  factory: async function* (ctx, { policy, spawn, timers }): AsyncGenerator<sandbox.ExecEvent, sandbox.ExecResult, unknown> {
    const child = spawn(ctx.input.command, [...(ctx.input.args ?? [])], {
      signal: ctx.signal,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let size = 0
    let limitExceeded = false
    let timedOut = false
    const append = (target: Buffer[], chunk: Buffer): void => {
      size += chunk.byteLength
      if (size > policy.maxOutputBytes) {
        limitExceeded = true
        child.kill("SIGKILL")
        return
      }
      target.push(chunk)
    }
    child.stdout.on("data", (chunk: Buffer) => append(stdout, chunk))
    child.stderr.on("data", (chunk: Buffer) => append(stderr, chunk))
    const timer = timers.set(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, policy.timeoutMs)
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject)
      child.once("close", (code) => resolve(code ?? -1))
    }).finally(() => timers.clear(timer))
    if (limitExceeded) throw new TriageError("evidence", ctx.input.command, `Process output exceeded ${policy.maxOutputBytes} bytes`)
    if (timedOut) throw new TriageError("evidence", ctx.input.command, `Process timed out after ${policy.timeoutMs}ms`)
    const result = {
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
      exitCode,
    }
    if (result.stdout) yield { type: "stdout", content: result.stdout }
    if (result.stderr) yield { type: "stderr", content: result.stderr }
    return result
  },
})

export const processBinding = sandbox.impl.run(process)
