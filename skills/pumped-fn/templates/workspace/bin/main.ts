import { createScope } from "@pumped-fn/lite"
import { greet } from "../src/app.ts"

const scope = createScope()
const ctx = scope.createContext()
const { text } = await ctx.exec({ flow: greet })
console.log(text)
await ctx.close({ ok: true })
await scope.dispose()
