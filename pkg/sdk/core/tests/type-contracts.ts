import { flow, type Lite } from "@pumped-fn/lite"
import { currentAgent, currentTool } from "@pumped-fn/sdk"

type AssertFalse<Value extends false> = Value

const accepted = currentTool({
  description: "Accepted.",
  flow: flow({ name: "accepted", factory: () => "ok" }),
})

currentAgent({ name: "accepted", tools: { accepted } })

type OrdinaryAccepted = Lite.Resource<string> extends Parameters<typeof currentAgent>[0]["tools"][string]
  ? true
  : false

type OrdinaryRejected = AssertFalse<OrdinaryAccepted>
