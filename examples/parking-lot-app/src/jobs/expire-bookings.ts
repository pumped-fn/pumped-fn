import { controller, flow } from "@pumped-fn/lite"
import { pumped } from "@pumped-fn/pumped"
import { readReport } from "@pumped-fn/parking-lot-shared"

export default flow({
  name: "expire-bookings",
  tags: [pumped.schedule({ cron: "*/5 * * * *" })],
  deps: { report: controller(readReport) },
  factory: (_ctx, deps) => deps.report.exec({ input: {} }),
})
