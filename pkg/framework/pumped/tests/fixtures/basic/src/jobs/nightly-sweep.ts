import { flow } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

const sweep = flow({ factory: () => undefined })

export default scheduler.schedule({
  name: "nightly-sweep",
  cadence: { cron: "0 2 * * *" },
  flow: sweep,
  input: () => undefined,
})
