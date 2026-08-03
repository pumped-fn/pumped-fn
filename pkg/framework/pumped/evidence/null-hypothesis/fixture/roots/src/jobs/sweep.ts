import { flow } from "@pumped-fn/pumped/app"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

const sweep = flow({ name: "ROOT_JOB", factory: () => "ROOT_JOB" })

export default scheduler.schedule({
  name: "ROOT_JOB",
  cadence: { cron: "0 2 * * *" },
  flow: sweep,
  input: () => undefined,
})
