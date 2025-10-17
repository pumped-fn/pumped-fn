import { createScope, provide, derive, flow, name } from "@pumped-fn/core-next"
import { createDevtoolsExtension, tuiExecutor } from "../src/index"
import { z } from "zod"

const logger = provide(() => ({
  info: (msg: string) => console.log(`[INFO] ${msg}`)
}), name("logger"))

const database = derive([logger], ([log]) => ({
  query: async (sql: string) => {
    log.info(`Query: ${sql}`)
    return { rows: [] }
  }
}), name("database"))

const userFlow = flow({
  name: "createUser",
  input: z.object({ name: z.string() }),
  output: z.object({ id: z.string() }),
  dependencies: [database],
  handler: async ([db], ctx, input) => {
    await db.query(`INSERT INTO users (name) VALUES ('${input.name}')`)
    return { id: "user-123" }
  }
})

const devtoolsExt = createDevtoolsExtension()

const devtoolsScope = createScope()
const tui = await devtoolsScope.resolve(tuiExecutor)
tui.start()

const appScope = createScope({ extensions: [devtoolsExt] })

await appScope.resolve(logger)
await appScope.resolve(database)
await appScope.exec(userFlow, { name: "Alice" })

setTimeout(async () => {
  tui.stop()
  await appScope.dispose()
  await devtoolsScope.dispose()
  process.exit(0)
}, 3000)
