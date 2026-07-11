import { spawn } from "node:child_process"
import { Readable, Writable } from "node:stream"
import { atom } from "@pumped-fn/lite"

export const spawnProcess = atom({ factory: () => spawn })

export const webStreams = atom({
  factory: () => ({ readable: Readable.toWeb, writable: Writable.toWeb }),
})
