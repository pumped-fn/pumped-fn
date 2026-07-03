import { flow } from "@pumped-fn/lite"
import { pumped } from "@pumped-fn/pumped"

export default flow({
  tags: [pumped.schedule({ cron: "*/5 * * * *" })],
  factory: () => undefined,
})
