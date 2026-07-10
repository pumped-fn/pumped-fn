import { createScope, flow, typed } from "@pumped-fn/lite"
import { channel, issueAlert, quietHours, type Alert, type ChannelReceipt } from "../src/alerts.ts"

const consoleChannel = (label: string) =>
  flow({
    name: `channel.${label}`,
    parse: typed<Alert>(),
    factory: (ctx): ChannelReceipt => {
      console.log(`[${label}] ${ctx.input.severity}: ${ctx.input.text}`)
      return { delivered: true }
    },
  })

const scope = createScope({
  tags: [
    channel(consoleChannel("radio")),
    channel(consoleChannel("siren")),
    quietHours({ startHour: 1, endHour: 5 }),
  ],
})
const session = scope.createContext()
const warning = await session.exec({
  flow: issueAlert,
  input: { severity: "warning", text: "storm front moving in", hour: 3 },
})
const watch = await session.exec({
  flow: issueAlert,
  input: { severity: "watch", text: "light snow expected", hour: 3 },
})
console.log(JSON.stringify({ warning, watch }))
await session.close()
await scope.dispose()
