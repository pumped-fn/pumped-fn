import { spawn } from "node:child_process"
import { isAbsolute } from "node:path"
import { Readable, Writable } from "node:stream"
import { atom } from "@pumped-fn/lite"

export const spawnProcess = atom({ factory: () => spawn })

export const absolutePath = atom({ factory: () => isAbsolute })

export const webStreams = atom({
  factory: () => ({ readable: Readable.toWeb, writable: Writable.toWeb }),
})
