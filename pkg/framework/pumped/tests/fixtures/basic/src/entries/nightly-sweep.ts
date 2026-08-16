import { flow } from "@pumped-fn/lite"
import { entry, schedule } from "@pumped-fn/pumped"

const sweep = flow({ factory: () => undefined })

export default entry({ flow: sweep, tags: [schedule({ cron: "0 2 * * *", name: "nightly-sweep" })] })
