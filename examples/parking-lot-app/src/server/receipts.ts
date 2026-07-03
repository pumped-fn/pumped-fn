import { listReceipts } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default {
  ...listReceipts,
  tags: [...(listReceipts.tags ?? []), pumped.route({ method: "GET" })],
}
