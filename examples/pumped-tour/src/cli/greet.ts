import { command } from "@pumped-fn/pumped/meta"

export { greet as default } from "../domain/greet"

export const meta = command({ name: "greet", description: "Greet a person" })
