import { flow, typed } from "@pumped-fn/lite"
import { command, entry, route } from "@pumped-fn/pumped"

const greet = flow({
  parse: typed<{ name?: string }>(),
  factory: (ctx) => ({ message: `Hello, ${ctx.input?.name ?? "there"} from dual-host-greeting` }),
})

export default entry({
  flow: greet,
  tags: [route({ method: "GET", path: "/greet" }), command({ name: "greet", description: "Greet a person" })],
})
