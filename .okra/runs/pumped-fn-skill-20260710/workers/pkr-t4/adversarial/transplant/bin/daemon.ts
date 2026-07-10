import { createInterface } from "node:readline"
import { createScope } from "@pumped-fn/lite"
import { lowBatterySweep, reportPosition } from "../src/telemetry.ts"

const scope = createScope()
const session = scope.createContext()

for await (const line of createInterface({ input: process.stdin })) {
  if (line.trim() === "") continue
  try {
    await session.exec({ flow: reportPosition, input: JSON.parse(line) })
  } catch (error) {
    console.error(JSON.stringify({ rejected: true, reason: String(error) }))
  }
}

const sweep = await session.exec({ flow: lowBatterySweep })
await session.close()
await scope.dispose()
console.log(JSON.stringify({ sweep }, null, 2))
