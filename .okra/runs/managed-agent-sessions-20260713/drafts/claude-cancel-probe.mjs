import { spawn } from "node:child_process"

const child = spawn(process.env.CLAUDE_BIN ?? "claude", [
  "-p",
  "--verbose",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--tools",
  "",
  "--permission-mode",
  "dontAsk",
  "--no-session-persistence",
], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
})

const pid = child.pid
const events = []
let buffer = ""
let stderr = ""
let interruptedAtInit = false

child.stdin.write(`${JSON.stringify({
  type: "user",
  message: { role: "user", content: "Explain managed sessions in 2000 words." },
})}\n`)

child.stdout.setEncoding("utf8")
child.stdout.on("data", (chunk) => {
  buffer += chunk
  const lines = buffer.split("\n")
  buffer = lines.pop() ?? ""
  for (const line of lines) {
    if (!line) continue
    const event = JSON.parse(line)
    events.push(event)
    if (!interruptedAtInit && event.type === "system" && event.subtype === "init") {
      interruptedAtInit = true
      child.kill("SIGINT")
    }
  }
})

child.stderr.setEncoding("utf8")
child.stderr.on("data", (chunk) => {
  stderr += chunk
})

const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000)
const exit = await new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal })))
clearTimeout(timeout)

let processAlive = false
try {
  process.kill(pid, 0)
  processAlive = true
} catch {
  processAlive = false
}

const output = {
  pid,
  interruptedAtInit,
  exit,
  processAlive,
  stderr,
  eventTypes: events.map((event) => `${event.type}${event.subtype ? `/${event.subtype}` : ""}`),
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
const cancellationResult = events.find((event) => event.type === "result" && event.subtype === "error_during_execution")
process.exitCode = interruptedAtInit
  && exit.code === 0
  && exit.signal === null
  && processAlive === false
  && cancellationResult !== undefined
  ? 0
  : 1
