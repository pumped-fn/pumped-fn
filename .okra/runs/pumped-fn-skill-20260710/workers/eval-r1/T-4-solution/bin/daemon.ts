import { createInterface } from "node:readline"
import { createApp } from "../src/wire.ts"
import { lowBatterySweep, reportPosition } from "../src/telemetry.ts"

let tick = 0
const app = createApp({
  fleetOps: { dispatchPickup: async () => ({ accepted: true }) },
  now: () => {
    tick += 1
    return tick
  },
})
const session = app.scope.createContext()
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

function formatError(error: unknown): string {
  const messages: string[] = []
  let current = error
  while (current instanceof Error) {
    messages.push(current.message)
    current = current.cause
  }
  return messages.join(": ")
}

for await (const line of lines) {
  try {
    await session.exec({ flow: reportPosition, rawInput: JSON.parse(line) })
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`)
  }
}

try {
  await session.exec({ flow: lowBatterySweep })
  await session.close({ ok: true })
} catch (error) {
  await session.close({ ok: false, error })
  process.stderr.write(`${formatError(error)}\n`)
}
process.stdout.write(`${JSON.stringify(app.trail())}\n`)
await app.scope.dispose()
