import { flow } from "@pumped-fn/lite"
import { command, entry } from "@pumped-fn/pumped"

const report = flow({ factory: () => ({ rows: 0 }) })

export default entry({ flow: report, tags: [command({ name: "report", description: "Print the report" })] })
