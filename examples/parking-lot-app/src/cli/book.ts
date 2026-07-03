import { controller, flow, typed } from "@pumped-fn/lite"
import { bookSpace, type BookSpaceInput } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export default flow({
  name: "book",
  parse: typed<BookSpaceInput>(),
  tags: [
    pumped.command({
      description: "Book a space. --json '{\"lotId\":string,\"plate\":string,\"startAt\":string,\"endAt\":string}'",
    }),
  ],
  deps: { run: controller(bookSpace) },
  factory: (ctx, { run }) => run.exec({ input: ctx.input }),
})
