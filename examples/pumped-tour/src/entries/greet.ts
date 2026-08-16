import { command, entry, route } from "@pumped-fn/pumped"
import { greet } from "../domain/greet"

export default entry({
  flow: greet,
  tags: [route({ method: "GET", path: "/greet" }), command({ name: "greet", description: "Greet a person" })],
})
