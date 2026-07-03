import { expireBookings } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default pumped.entry(expireBookings, {
  name: "expire-bookings",
  tags: [pumped.schedule({ cron: "*/5 * * * *" })],
})
