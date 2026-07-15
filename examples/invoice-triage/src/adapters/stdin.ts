import { atom } from "@pumped-fn/lite"
import { createInterface } from "node:readline"

export const intakeLines = atom({
  factory: (ctx): AsyncIterable<string> => {
    const lines = createInterface({ input: process.stdin })
    ctx.cleanup((target) => target.close(), lines)
    return lines
  },
})
