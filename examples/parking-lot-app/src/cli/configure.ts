export { configureLot as default } from "@pumped-fn/parking-lot-shared"
import { command } from "@pumped-fn/pumped"

export const meta = command({
  description:
    "Create or update a lot. --json '{\"name\":string,\"capacity\":number,\"rateCentsPerHour\":number,\"graceMinutes\":number,\"bookingLeadMinutes\":number,\"currency\":string,\"refundWindowMinutes\":number,\"lotId\"?:string}'",
})
