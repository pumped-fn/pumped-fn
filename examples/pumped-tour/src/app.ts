import { app } from "@pumped-fn/pumped/app"
import { region } from "./domain/greet"

export default app({
  tags: [region("default")],
})
