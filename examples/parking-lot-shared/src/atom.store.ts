import { atom } from "@pumped-fn/lite"
import { createMemoryStore } from "./store"

export const store = atom({
  factory: () => createMemoryStore(),
})
