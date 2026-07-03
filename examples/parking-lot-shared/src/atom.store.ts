import { atom, tags } from "@pumped-fn/lite"
import { dbPath } from "./tags"

// The sqlite driver (node:sqlite) is dynamically imported so this module
// stays free of node-only imports — parking-lot-spa depends on the main
// entry from a browser bundle and cannot resolve node:sqlite statically.
export const store = atom({
  deps: { path: tags.required(dbPath) },
  factory: async (_ctx, { path }) => {
    const { createSqliteStore } = await import("./sqlite")
    return createSqliteStore(path)
  },
})
