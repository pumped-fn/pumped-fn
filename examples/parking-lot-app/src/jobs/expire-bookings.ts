import { expireBookings } from "@pumped-fn/parking-lot-shared"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

export default scheduler.schedule({
  name: "expire-bookings",
  cadence: { cron: "*/5 * * * *" },
  flow: expireBookings,
  input: () => ({}),
})
