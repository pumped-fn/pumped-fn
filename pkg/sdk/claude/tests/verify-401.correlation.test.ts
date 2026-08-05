import { EventEmitter } from "node:events"
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process"
import { PassThrough } from "node:stream"
import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { expect, it } from "vitest"
import {
  ClaudeInterruptError,
  claudeConfig,
  claudeLeases,
  claudeRun,
  clock,
  spawnProcess,
} from "../src/index"

it("does not let a late cancelled result settle a later plain prompt", async () => {
  const harness = createHarness()
  const timers = createClock()
  const controller = new AbortController()
  const scope = createScope({
    presets: [preset(clock, timers.clock), preset(spawnProcess, harness.spawnProcess)],
    tags: [claudeConfig(config())],
  })
  const ctx = scope.createContext()
  const first = ctx.exec({ flow: claudeRun, input: { prompt: "first" }, signal: controller.signal })
  await harness.writes(1)

  controller.abort()
  controller.abort()
  await expect(first).rejects.toMatchObject({ name: "AbortError" })
  const second = ctx.exec({ flow: claudeRun, input: { prompt: "second" } })
  await tick()
  expect(harness.prompts).toEqual(["first"])

  harness.result("late-first")
  await harness.writes(2)
  harness.result("real-second")

  await expect(second).resolves.toBe("real-second")
  expect(harness.interrupts).toBe(1)
  expect(timers.active).toBe(0)

  await ctx.close()
  await scope.dispose()
})

it("does not start a queued prompt aborted before it becomes current", async () => {
  const harness = createHarness()
  const queuedController = new AbortController()
  const scope = createScope({
    presets: [preset(spawnProcess, harness.spawnProcess)],
    tags: [claudeConfig(config())],
  })
  const ctx = scope.createContext()
  const first = ctx.exec({ flow: claudeRun, input: { prompt: "first" } })
  const aborted = ctx.exec({ flow: claudeRun, input: { prompt: "never-start" }, signal: queuedController.signal })
  const third = ctx.exec({ flow: claudeRun, input: { prompt: "third" } })
  await harness.writes(1)

  queuedController.abort()
  await expect(aborted).rejects.toMatchObject({ name: "AbortError" })
  expect(harness.interrupts).toBe(0)
  harness.result("first-result")
  await expect(first).resolves.toBe("first-result")
  await harness.writes(2)
  expect(harness.prompts).toEqual(["first", "third"])
  harness.result("third-result")
  await expect(third).resolves.toBe("third-result")

  await ctx.close()
  await scope.dispose()
})

it("does not let a late timed-out result settle a later plain prompt", async () => {
  const harness = createHarness()
  const timers = createClock()
  const scope = createScope({
    presets: [preset(clock, timers.clock), preset(spawnProcess, harness.spawnProcess)],
    tags: [claudeConfig(config({ timeoutMs: 10 }))],
  })
  const ctx = scope.createContext()
  const first = ctx.exec({ flow: claudeRun, input: { prompt: "first" } })
  await harness.writes(1)
  const timedOut = expect(first).rejects.toThrow("Claude prompt timed out after 10ms")

  await timers.advance()
  await timedOut
  const second = ctx.exec({ flow: claudeRun, input: { prompt: "second" } })
  harness.result("late-first")
  await harness.writes(2)
  harness.result("real-second")

  await expect(second).resolves.toBe("real-second")
  expect(harness.interrupts).toBe(1)
  expect(timers.active).toBe(0)

  await ctx.close()
  await scope.dispose()
})

it("keeps the managed lease twin correlated and clears its poison timer", async () => {
  const harness = createHarness()
  const timers = createClock()
  const controller = new AbortController()
  const scope = createScope({
    presets: [preset(clock, timers.clock), preset(spawnProcess, harness.spawnProcess)],
    tags: [claudeConfig(config())],
  })
  const ctx = scope.createContext()
  const leases = await ctx.resolve(claudeLeases)
  const first = leases.prompt("shared", "first", controller.signal)
  const firstEvents = collect(first.events).catch((error: unknown) => error)
  await harness.writes(1)

  controller.abort()
  await expect(first.result).rejects.toMatchObject({ name: "AbortError" })
  await expect(firstEvents).resolves.toMatchObject({ name: "AbortError" })
  const second = leases.prompt("shared", "second")
  const secondEvents = collect(second.events)
  await tick()
  expect(harness.prompts).toEqual(["first"])

  harness.result("late-first")
  await harness.writes(2)
  harness.result("real-second")

  await expect(second.result).resolves.toBe("real-second")
  await expect(secondEvents).resolves.toEqual([
    { type: "provider_status", status: "started" },
    { type: "provider_status", status: "completed" },
  ])
  expect(harness.interrupts).toBe(1)
  expect(timers.active).toBe(0)

  await ctx.close()
  await scope.dispose()
})

it("poisons a plain session when an interrupted turn never ends", async () => {
  const harness = createHarness()
  const timers = createClock()
  const controller = new AbortController()
  const scope = createScope({
    presets: [preset(clock, timers.clock), preset(spawnProcess, harness.spawnProcess)],
    tags: [claudeConfig(config())],
  })
  const ctx = scope.createContext()
  const first = ctx.exec({ flow: claudeRun, input: { prompt: "first" }, signal: controller.signal })
  await harness.writes(1)
  controller.abort()
  await expect(first).rejects.toMatchObject({ name: "AbortError" })
  const queued = ctx.exec({ flow: claudeRun, input: { prompt: "queued" } })
  const failure = queued.catch((error: unknown) => error)

  await timers.advance()

  await expect(failure).resolves.toBeInstanceOf(ClaudeInterruptError)
  expect(harness.prompts).toEqual(["first"])
  expect(harness.signals).toEqual(["SIGINT"])
  expect(timers.active).toBe(0)

  await ctx.close()
  await scope.dispose()
})

it("poisons the managed lease twin when an interrupted turn never ends", async () => {
  const harness = createHarness()
  const timers = createClock()
  const controller = new AbortController()
  const scope = createScope({
    presets: [preset(clock, timers.clock), preset(spawnProcess, harness.spawnProcess)],
    tags: [claudeConfig(config())],
  })
  const ctx = scope.createContext()
  const leases = await ctx.resolve(claudeLeases)
  const first = leases.prompt("shared", "first", controller.signal)
  const firstEvents = collect(first.events).catch((error: unknown) => error)
  await harness.writes(1)
  controller.abort()
  await expect(first.result).rejects.toMatchObject({ name: "AbortError" })
  await expect(firstEvents).resolves.toMatchObject({ name: "AbortError" })
  const queued = leases.prompt("shared", "queued")
  const queuedEvents = collect(queued.events).catch((error: unknown) => error)
  const failure = queued.result.catch((error: unknown) => error)

  await timers.advance()

  await expect(failure).resolves.toBeInstanceOf(ClaudeInterruptError)
  await expect(queuedEvents).resolves.toBeInstanceOf(ClaudeInterruptError)
  expect(harness.prompts).toEqual(["first"])
  expect(harness.signals).toEqual(["SIGINT"])
  expect(timers.active).toBe(0)

  await ctx.close()
  await scope.dispose()
})

function config(overrides: Partial<Parameters<typeof claudeConfig>[0]> = {}): Parameters<typeof claudeConfig>[0] {
  return {
    auth: { kind: "global" },
    cwd: process.cwd(),
    roots: [],
    shutdownTimeoutMs: 25,
    ...overrides,
  }
}

function createHarness() {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const prompts: string[] = []
  const signals: NodeJS.Signals[] = []
  let interrupts = 0
  let buffered = ""
  let live = true
  stdin.setEncoding("utf8")
  stdin.on("data", (chunk: string) => {
    buffered += chunk
    const lines = buffered.split("\n")
    buffered = lines.pop() ?? ""
    for (const line of lines) {
      const message = JSON.parse(line) as
        | { type: "control_request" }
        | { type: "user"; message: { content: string } }
      if (message.type === "control_request") interrupts++
      else prompts.push(message.message.content)
    }
  })
  const close = () => {
    if (!live) return
    live = false
    stdout.end()
    stderr.end()
    child.emit("close", 0, null)
  }
  const child = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    kill: (signal: NodeJS.Signals = "SIGTERM") => {
      signals.push(signal)
      close()
      return true
    },
  }) as unknown as ChildProcessWithoutNullStreams
  stdin.on("finish", close)
  const replacement = ((_command: string, _args: readonly string[], _options: SpawnOptionsWithoutStdio) => child) as Lite.Utils.AtomValue<typeof spawnProcess>
  return {
    spawnProcess: replacement,
    prompts,
    signals,
    result(value: string) {
      stdout.write(`${JSON.stringify({ type: "result", result: value, is_error: false })}\n`)
    },
    async writes(count: number) {
      while (prompts.length < count) await tick()
    },
    get interrupts() {
      return interrupts
    },
  }
}

function createClock() {
  let next = 0
  const timers = new Map<number, () => void>()
  const replacement: Lite.Utils.AtomValue<typeof clock> = {
    set(fn) {
      const token = next++
      timers.set(token, fn)
      return token
    },
    clear(token) {
      timers.delete(token)
    },
  }
  return {
    clock: replacement,
    get active() {
      return timers.size
    },
    async advance() {
      const entry = timers.entries().next().value
      if (!entry) throw new Error("No timer to advance")
      timers.delete(entry[0])
      entry[1]()
      await tick()
    },
  }
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of stream) values.push(value)
  return values
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
