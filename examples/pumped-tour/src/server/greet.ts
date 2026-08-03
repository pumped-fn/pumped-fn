import { route } from "@pumped-fn/pumped/meta"

export { greet as default } from "../domain/greet"

export const meta = route({ method: "GET", path: "/greet" })
