import { controller, flow, typed } from "@pumped-fn/lite"
import { readReport, type ReadReportInput } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default flow({
  name: "report",
  parse: typed<ReadReportInput>(),
  tags: [pumped.command({ description: "Read a lot occupancy/revenue report. --json '{\"lotId\"?:string}'" })],
  deps: { run: controller(readReport) },
  factory: (ctx, { run }) => run.exec({ input: ctx.input }),
})
