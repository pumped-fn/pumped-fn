import { execFileSync, spawnSync } from "node:child_process"
import { createServer } from "node:net"
import { Kvm } from "@nats-io/kv"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { nats } from "../src"

const encoder = new TextEncoder()

const canRun = docker()
const run = canRun ? describe : describe.skip

if (!canRun && process.env.CI) {
  throw new Error("Docker is required for NATS scheduler integration tests in CI")
}

run("nats scheduler backend integration", () => {
  let container = ""
  let nc: NatsConnection

  beforeAll(async () => {
    const port = await freePort()
    container = `pumped-scheduler-nats-${process.pid}-${port}`
    execFileSync("docker", [
      "run",
      "--rm",
      "-d",
      "--name",
      container,
      "-p",
      `${port}:4222`,
      "nats:2.12-alpine",
      "-js",
    ], { stdio: "pipe" })
    nc = await connectServer(port)
  })

  afterAll(async () => {
    await nc?.close()
    if (container) {
      spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" })
    }
  })

  it("runs a shared tick exactly once across two backend instances against real JetStream KV", async () => {
    const bucket = `sched${process.pid}a`
    const calls: number[] = []
    const spec = { name: "shared", cadence: { cron: "0 0 * * *" }, overlap: "skip" as const, catchUp: "skip" as const }
    const tick = async () => {
      calls.push(calls.length + 1)
    }

    const backendA = nats({ connection: nc, bucket })
    const backendB = nats({ connection: nc, bucket })
    const regA = backendA.register(spec, tick)
    const regB = backendB.register(spec, tick)

    await Promise.all([regA.trigger("shared-once"), regB.trigger("shared-once")])

    expect(calls).toEqual([1])

    await regA.stop()
    await regB.stop()
  })

  it("catches up on the most recent missed tick after a simulated gap", async () => {
    const bucket = `sched${process.pid}b`
    const kv = await new Kvm(nc).create(bucket)
    const missed = new Date(Date.now() - 3 * 60 * 60 * 1000)
    await kv.put(`last.catchup`, encoder.encode(missed.toISOString()))

    const calls: Date[] = []
    const backend = nats({ connection: nc, bucket })
    const registration = backend.register(
      { name: "catchup", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "last" },
      async (run) => {
        calls.push(run.scheduledAt)
      }
    )

    await until(() => calls.length === 1)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.getTime()).toBeGreaterThan(missed.getTime())

    await registration.stop()
  })

  it("skips cleanly when no scheduled tick has been missed", async () => {
    const bucket = `sched${process.pid}c`
    const calls: Date[] = []
    const backend = nats({ connection: nc, bucket })
    const registration = backend.register(
      { name: "no-gap", cadence: { cron: "0 0 1 1 *" }, overlap: "skip", catchUp: "all" },
      async (run) => {
        calls.push(run.scheduledAt)
      }
    )

    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(calls).toEqual([])

    await registration.stop()
  })
})

function docker(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (!address || typeof address === "string") throw new Error("Port allocation failed")
  return address.port
}

async function connectServer(port: number): Promise<NatsConnection> {
  let last: unknown
  for (let i = 0; i < 60; i++) {
    try {
      return await connect({ servers: `127.0.0.1:${port}`, timeout: 1000 })
    } catch (error) {
      last = error
      await delay(500)
    }
  }
  throw last
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (check()) return
    await delay(50)
  }
  throw new Error("Condition was not reached")
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
