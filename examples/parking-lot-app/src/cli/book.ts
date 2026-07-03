export { bookSpace as default } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export const meta = pumped.command({
  description: "Book a space. --json '{\"lotId\":string,\"plate\":string,\"startAt\":string,\"endAt\":string}'",
})
