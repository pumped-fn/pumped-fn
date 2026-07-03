import { tag } from "@pumped-fn/lite"
import type { Actor } from "./model"

export const actor = tag<Actor>({ label: "parking.actor" })

export const rule = tag<{ name: string }>({ label: "parking.rule" })
