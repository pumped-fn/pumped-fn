export { readReport as default } from "@pumped-fn/parking-lot-shared"
import { pumped } from "@pumped-fn/pumped"

export const meta = pumped.command({ description: "Read a lot occupancy/revenue report. --json '{\"lotId\"?:string}'" })
