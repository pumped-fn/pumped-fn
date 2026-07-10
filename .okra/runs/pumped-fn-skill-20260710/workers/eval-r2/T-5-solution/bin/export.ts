import { createScope } from "@pumped-fn/lite"
import { exportCollection } from "../src/export.js"

const slugs = process.argv.slice(2)
const scope = createScope()
const ctx = scope.createContext()
const stream = ctx.execStream({
  flow: exportCollection,
  input: { slugs: slugs.length === 0 ? ["granola", "soda-bread", "pesto"] : slugs },
})

try {
  for await (const event of stream) console.log(JSON.stringify(event))
  console.log(JSON.stringify(await stream.result))
  await ctx.close({ ok: true })
} catch (error) {
  await ctx.close({ ok: false, error })
  throw error
} finally {
  await scope.dispose()
}
