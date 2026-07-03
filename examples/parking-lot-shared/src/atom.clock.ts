import { atom } from "@pumped-fn/lite"

export const clock = atom({
  factory: () => () => new Date().toISOString(),
})
