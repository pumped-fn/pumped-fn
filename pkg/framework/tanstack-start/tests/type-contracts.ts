import { createServerFn } from "@tanstack/react-start"
import { createScope, flow, typed, type Lite } from "@pumped-fn/lite"
import { tanstackStart } from "../src/index"
// @ts-expect-error adapter is contextualized under the tanstackStart namespace
import { adapter } from "../src/index"

const lite = tanstackStart.adapter()
const scope = createScope({ extensions: [lite] })
const echo = flow({
  parse: typed<{ message: string }>(),
  factory: (ctx) => ({ message: ctx.input.message }),
})

const req = lite.request()
const serverFn = lite.call()
const echoFn = createServerFn({ method: "POST" })
  .middleware([req, serverFn])
  .validator((input: { message: string }) => input)
  .handler(lite.handler(echo))

const result: Promise<{ message: string }> = echoFn({ data: { message: "ok" } })
void result

const context: tanstackStart.Context = { lite: scope.createContext() }
const execution: Lite.ExecutionContext = context.lite
void execution

lite.handler(echo)({ data: { message: "ok" }, context })

// @ts-expect-error server function input is checked by the validator
echoFn({ data: { id: "bad" } })

// @ts-expect-error flow handler input must match the Lite flow input
lite.handler(echo)({ data: { id: "bad" }, context })

// @ts-expect-error a Start context must carry the Lite execution context key
lite.handler(echo)({ data: { message: "ok" }, context: {} })
