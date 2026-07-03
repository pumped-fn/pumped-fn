import { controller, flow } from "@pumped-fn/lite"
import { expireBookings } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default flow({
  name: "expire-bookings",
  tags: [pumped.schedule({ cron: "*/5 * * * *" })],
  deps: { run: controller(expireBookings) },
  factory: (_ctx, { run }) => run.exec({ input: {} }),
})
