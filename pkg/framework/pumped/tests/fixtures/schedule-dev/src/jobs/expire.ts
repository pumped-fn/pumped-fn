import { flow } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

const expire = flow({ factory: () => undefined })

export default scheduler.schedule({
  name: "expire",
  cadence: { cron: "*/5 * * * *" },
  flow: expire,
  input: () => undefined,
})
