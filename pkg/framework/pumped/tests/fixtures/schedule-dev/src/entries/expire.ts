import { flow } from "@pumped-fn/lite"
import { entry, schedule } from "@pumped-fn/pumped"

const expire = flow({ factory: () => undefined })

export default entry({ flow: expire, tags: [schedule({ cron: "*/5 * * * *", name: "expire" })] })
