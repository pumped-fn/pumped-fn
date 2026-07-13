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
  "--add-dir",
  "/tmp",
], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
})

const events = []
let buffer = ""
let results = 0
let stderr = ""

const send = (content) => child.stdin.write(`${JSON.stringify({
  type: "user",
  message: { role: "user", content },
})}\n`)

send("Reply with exactly: TURN_ONE_OK")

child.stdout.setEncoding("utf8")
child.stdout.on("data", (chunk) => {
  buffer += chunk
  const lines = buffer.split("\n")
  buffer = lines.pop() ?? ""
  for (const line of lines) {
    if (!line) continue
    const event = JSON.parse(line)
    events.push(event)
    if (event.type !== "result") continue
    results += 1
    if (results === 1) send("Reply with exactly: TURN_TWO_OK")
    if (results === 2) child.stdin.end()
  }
})

child.stderr.setEncoding("utf8")
child.stderr.on("data", (chunk) => {
  stderr += chunk
})

const timeout = setTimeout(() => child.kill("SIGTERM"), 60_000)
const exit = await new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal })))
clearTimeout(timeout)

const init = events.find((event) => event.type === "system" && event.subtype === "init")
const resultEvents = events.filter((event) => event.type === "result")
const sessionIds = [...new Set(events.map((event) => event.session_id).filter(Boolean))]
const output = {
  binary: process.env.CLAUDE_BIN ?? "claude",
  exit,
  stderr,
  permissionMode: init?.permissionMode,
  tools: init?.tools,
  cwd: init?.cwd,
  sessionIds,
  results: resultEvents.map((event) => ({ subtype: event.subtype, is_error: event.is_error, result: event.result })),
  eventTypes: events.map((event) => `${event.type}${event.subtype ? `/${event.subtype}` : ""}`),
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
process.exitCode = exit.code === 0
  && exit.signal === null
  && stderr === ""
  && init?.permissionMode === "dontAsk"
  && Array.isArray(init.tools)
  && init.tools.length === 0
  && sessionIds.length === 1
  && resultEvents.length === 2
  && resultEvents[0]?.result === "TURN_ONE_OK"
  && resultEvents[1]?.result === "TURN_TWO_OK"
  ? 0
  : 1
