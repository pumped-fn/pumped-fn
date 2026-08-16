import { app } from "@pumped-fn/pumped"
import { region } from "./domain/greet"

export default app({
  tags: [region("default")],
})
