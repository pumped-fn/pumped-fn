export { expireBookings as default } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export const meta = pumped.schedule({ cron: "*/5 * * * *" })
