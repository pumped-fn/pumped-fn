import { spawn } from "node:child_process"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "schedule-dev")
const bin = resolve(import.meta.dirname, "../../dist/cli.mjs")
const child = spawn(process.execPath, [bin, "dev"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
})

let output = ""
function fail(message) {
  child.kill("SIGTERM")
  process.stderr.write(`${message}\n---\n${output}\n`)
  process.exit(1)
}

try {
  const port = await new Promise((resolvePort, rejectPort) => {
    const timer = setTimeout(() => rejectPort(new Error("dev server did not print a URL within 30s")), 30_000)
    const onData = (chunk) => {
      output += chunk
      const plain = output.replaceAll(/\u001b\[[0-9;]*m/g, "")
      const match = plain.match(/(?:localhost|127\.0\.0\.1):(\d+)/)
      if (match) {
        clearTimeout(timer)
        resolvePort(Number(match[1]))
      }
    }
    child.stdout.on("data", onData)
    child.stderr.on("data", onData)
    child.on("exit", (code) => {
      clearTimeout(timer)
      rejectPort(new Error(`dev server exited early with code ${code}`))
    })
  })

  let body
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ping`)
      if (response.status === 200) {
        body = await response.json()
        break
      }
    } catch {}
    await new Promise((wake) => setTimeout(wake, 200))
  }

  if (body?.pong !== true) fail(`GET /ping never answered { pong: true }`)

  child.kill("SIGTERM")
  process.stdout.write("OK\n")
  process.exit(0)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
