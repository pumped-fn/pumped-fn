import { listReceipts } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default pumped.entry(listReceipts, {
  name: "receipts",
  tags: [pumped.route({ method: "GET" })],
})
