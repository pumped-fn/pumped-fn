import { tag } from "@pumped-fn/lite"
import type { Model } from "./index.js"

export const model = tag<Model>({ label: "agent.model" })
