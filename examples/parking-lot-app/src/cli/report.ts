import { readReport } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default {
  ...readReport,
  tags: [
    ...(readReport.tags ?? []),
    pumped.command({ description: "Read a lot occupancy/revenue report. --json '{\"lotId\"?:string}'" }),
  ],
}
