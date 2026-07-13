import { flow, typed, type Lite } from "@pumped-fn/lite"
import { currentAgent, currentTool } from "@pumped-fn/sdk"
import * as z from "zod"

type AssertFalse<Value extends false> = Value

const accepted = currentTool({
  description: "Accepted.",
  inputSchema: z.unknown(),
  flow: flow({ name: "accepted", parse: typed<unknown>(), factory: () => "ok" }),
})

currentAgent({ name: "accepted", tools: { accepted } })

type OrdinaryAccepted = Lite.Resource<string> extends Parameters<typeof currentAgent>[0]["tools"][string]
  ? true
  : false

type OrdinaryRejected = AssertFalse<OrdinaryAccepted>
