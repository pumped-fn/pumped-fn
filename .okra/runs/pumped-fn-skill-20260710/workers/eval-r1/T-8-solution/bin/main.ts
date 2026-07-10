import { createScope } from "@pumped-fn/lite"
import { channel, issueAlert, quietHours } from "../src/alerts.ts"

const scope = createScope({
  tags: [
    channel({
      name: "radio",
      send: alert => {
        console.log(`radio: ${alert.text}`)
        return { delivered: true }
      },
    }),
    channel({
      name: "siren",
      send: alert => {
        console.log(`siren: ${alert.text}`)
        return { delivered: true }
      },
    }),
    quietHours({ startHour: 1, endHour: 5 }),
  ],
})
const ctx = scope.createContext()

console.log(JSON.stringify(await ctx.exec({
  flow: issueAlert,
  input: { severity: "warning", text: "heavy snow", hour: 3 },
})))
console.log(JSON.stringify(await ctx.exec({
  flow: issueAlert,
  input: { severity: "watch", text: "light snow", hour: 3 },
})))

await ctx.close({ ok: true })
await scope.dispose()
