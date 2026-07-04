export { bookSpace as default } from "@pumped-fn/parking-lot-shared"
import { command } from "@pumped-fn/pumped"

export const meta = command({
  description: "Book a space. --json '{\"lotId\":string,\"plate\":string,\"startAt\":string,\"endAt\":string}'",
})
