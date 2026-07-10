import { createInterface } from "node:readline"
import { createApp } from "../src/wire.ts"
import { lowBatterySweep, reportPosition } from "../src/telemetry.ts"

let tick = 0
function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.message}${error.cause === undefined ? "" : `: ${errorMessage(error.cause)}`}`
  return String(error)
}

const app = createApp({
  fleetOps: { dispatchPickup: async () => ({ accepted: true }) },
  now: () => tick++,
})
const session = app.scope.createContext()
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of lines) {
  try {
    await session.exec({ flow: reportPosition, rawInput: JSON.parse(line) })
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ kind: "rejected", message: errorMessage(error) })}\n`)
  }
}

try {
  await session.exec({ flow: lowBatterySweep })
  await session.close({ ok: true })
} catch (error) {
  await session.close({ ok: false, error })
} finally {
  process.stdout.write(`${JSON.stringify(app.trail())}\n`)
  await app.scope.dispose()
}
