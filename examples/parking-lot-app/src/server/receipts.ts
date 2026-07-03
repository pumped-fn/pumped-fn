import { controller, flow, typed } from "@pumped-fn/lite"
import { listReceipts, type ListReceiptsInput } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default flow({
  name: "receipts",
  parse: typed<ListReceiptsInput>(),
  tags: [pumped.route({ method: "GET" })],
  deps: { run: controller(listReceipts) },
  factory: (ctx, { run }) => run.exec({ input: ctx.input }),
})
