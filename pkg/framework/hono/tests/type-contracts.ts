import { createScope, flow, typed, type Lite } from "@pumped-fn/lite"
import { Hono } from "hono"
import { hono } from "../src/index"
// @ts-expect-error adapter is contextualized under the hono namespace
import { adapter } from "../src/index"

type BaseEnv = { Variables: { user: string } }

const lite = hono.adapter()
createScope({ extensions: [lite] })
const app = new Hono<hono.Env<BaseEnv>>()
const echo = flow({
  parse: typed<{ message: string }>(),
  factory: (ctx) => ctx.input.message,
})

app.use("*", lite.middleware<BaseEnv>())
app.get("/user", (context) => {
  const user: string = context.get("user")
  const execution: Lite.ExecutionContext = context.var.lite

  void user
  void execution

  return context.text("ok")
})
app.get("/echo", async (context) =>
  context.text(await context.var.lite.exec({ flow: echo, input: { message: "ok" } }))
)

app.get("/bad-lite", (context) => {
  // @ts-expect-error Hono variables expose the execution context, not a string
  const value: string = context.var.lite
  return context.text(value)
})

app.get("/bad-input", async (context) => {
  // @ts-expect-error flow input must match the typed Lite flow input
  return context.text(await context.var.lite.exec({ flow: echo, input: { id: "bad" } }))
})

const liteCtx = hono.adapter({ key: "ctx" })
createScope({ extensions: [liteCtx] })
const custom = new Hono<hono.Env<{}, "ctx">>()

custom.use("*", liteCtx.middleware<{}>())
custom.get("/", (context) => {
  const execution: Lite.ExecutionContext = context.var.ctx
  void execution
  return context.text("ok")
})

// @ts-expect-error custom-key middleware does not add the default lite variable
custom.get("/bad-key", (context) => context.text(String(context.var.lite)))

// @ts-expect-error custom context keys must be provided as runtime options
hono.adapter<"ctx">()
