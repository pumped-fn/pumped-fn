import { readReport } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default pumped.entry(readReport, {
  name: "report",
  tags: [pumped.command({ description: "Read a lot occupancy/revenue report. --json '{\"lotId\"?:string}'" })],
})
