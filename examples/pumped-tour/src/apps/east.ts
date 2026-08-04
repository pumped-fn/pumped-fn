import { app } from "@pumped-fn/pumped/app"
import base from "../app"
import { region } from "../domain/greet"

export default app(base, {
  tags: [region("east")],
})
