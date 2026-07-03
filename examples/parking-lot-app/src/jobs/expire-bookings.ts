export { expireBookings as default } from "@pumped-fn/parking-lot-shared"
import { schedule } from "@pumped-fn/pumped"

export const meta = schedule({ cron: "*/5 * * * *" })
