import { bookSpace } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default {
  ...bookSpace,
  tags: [
    ...(bookSpace.tags ?? []),
    pumped.command({
      description: "Book a space. --json '{\"lotId\":string,\"plate\":string,\"startAt\":string,\"endAt\":string}'",
    }),
  ],
}
