import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createServer as createNetServer } from "node:net"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { hmrMetaPath } from "@pumped-fn/lite-hmr"
import type { LiteMeta } from "@pumped-fn/lite-hmr"
import { afterEach, describe, expect, it } from "vitest"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
let dev: ChildProcessWithoutNullStreams | undefined

afterEach(async () => {
  const current = dev
  dev = undefined
  if (current) await stop(current)
}, 10000)

describe("vite dev mode", () => {
  it("runs the Start boundary and serves the Lite HMR feed", async () => {
    const port = await openPort()
    const output: string[] = []
    dev = spawn(resolve(root, "node_modules/.bin/vite"), [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ], {
      cwd: root,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
    })
    dev.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()))
    dev.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()))

    const base = `http://127.0.0.1:${port}`
    expect(await read(base, output)).toContain("<h1>Todos</h1>")

    const domain = await read(`${base}/src/domain.ts`, output)
    expect(domain).toContain("__hmr_register")

    for (const path of [
      "/src/start.ts",
      "/src/todo.functions.ts",
      "/src/routes/index.tsx",
    ]) {
      await read(`${base}${path}`, output)
    }

    const meta = JSON.parse(await read(`${base}${hmrMetaPath}`, output)) as LiteMeta
    expect(meta.modules.map((mod) => mod.id)).toContain("src/domain.ts")
    expect(meta.handles.some((handle) => handle.name === "store")).toBe(true)
    expect(meta.atoms.some((atom) => atom.name === "store")).toBe(true)
  }, 30000)
})

async function read(url: string, output: string[]): Promise<string> {
  return await eventually(async () => {
    const response = await fetch(url)
    const body = await response.text()
    if (response.status !== 200) throw new Error(body)
    return body
  }, output)
}

async function eventually<T>(run: () => Promise<T>, output: string[]): Promise<T> {
  const deadline = Date.now() + 20000
  let failure: unknown

  while (Date.now() < deadline) {
    try {
      return await run()
    } catch (error) {
      failure = error
      await delay(250)
    }
  }

  throw new Error(`${failure instanceof Error ? failure.message : String(failure)}\n${output.join("")}`)
}

function openPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (typeof address !== "object" || !address) {
        reject(new Error("Could not allocate a dev-server port"))
        return
      }
      server.close(() => resolvePort(address.port))
    })
  })
}

function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolveStop) => {
    if (child.exitCode !== null) {
      resolveStop()
      return
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL")
    }, 5000)
    child.once("close", () => {
      clearTimeout(timer)
      resolveStop()
    })
    child.kill("SIGTERM")
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}
