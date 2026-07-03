export { readReport as default } from "@pumped-fn/parking-lot-shared"
import { command } from "@pumped-fn/pumped"

export const meta = command({ description: "Read a lot occupancy/revenue report. --json '{\"lotId\"?:string}'" })
