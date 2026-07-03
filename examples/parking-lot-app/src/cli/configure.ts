import { controller, flow, typed } from "@pumped-fn/lite"
import { configureLot, type ConfigureLotInput } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default flow({
  name: "configure",
  parse: typed<ConfigureLotInput>(),
  tags: [
    pumped.command({
      description:
        "Create or update a lot. --json '{\"name\":string,\"capacity\":number,\"rateCentsPerHour\":number,\"graceMinutes\":number,\"bookingLeadMinutes\":number,\"currency\":string,\"refundWindowMinutes\":number,\"lotId\"?:string}'",
    }),
  ],
  deps: { run: controller(configureLot) },
  factory: (ctx, { run }) => run.exec({ input: ctx.input }),
})
