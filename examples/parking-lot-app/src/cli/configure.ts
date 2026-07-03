import { configureLot } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default {
  ...configureLot,
  tags: [
    ...(configureLot.tags ?? []),
    pumped.command({
      description:
        "Create or update a lot. --json '{\"name\":string,\"capacity\":number,\"rateCentsPerHour\":number,\"graceMinutes\":number,\"bookingLeadMinutes\":number,\"currency\":string,\"refundWindowMinutes\":number,\"lotId\"?:string}'",
    }),
  ],
}
