import { preset } from "@pumped-fn/lite"
import type { pumped } from "@pumped-fn/pumped"
import { actor, createMemoryStore, now, store, type Actor, type Role } from "@pumped-fn/parking-lot-shared"

const database = createMemoryStore()

function readRole(value: string | undefined): Role {
  if (value === "manager" || value === "operator" || value === "user") return value
  throw new Error(`unknown role: ${value ?? "missing"}`)
}

function contextTags(request?: Request) {
  const actorId = request?.headers.get("x-actor-id") ?? process.env["PARKING_ACTOR_ID"] ?? "anonymous"
  const role = readRole(request?.headers.get("x-role") ?? process.env["PARKING_ROLE"] ?? "manager")
  const value: Actor = { id: actorId, role }
  return [actor(value), now(() => new Date().toISOString())]
}

export default {
  presets: [preset(store, database)],
  context: contextTags,
} satisfies pumped.Config
