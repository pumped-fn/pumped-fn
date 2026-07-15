import { atom } from "@pumped-fn/lite"
import { spawn } from "node:child_process"

export const spawnProcess = atom({
  factory: () => spawn,
})

export const timers = atom({
  factory: () => ({ set: setTimeout, clear: clearTimeout }),
})
