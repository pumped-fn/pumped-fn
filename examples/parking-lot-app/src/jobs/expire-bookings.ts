import { expireBookings } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default {
  ...expireBookings,
  tags: [...(expireBookings.tags ?? []), pumped.schedule({ cron: "*/5 * * * *" })],
}
