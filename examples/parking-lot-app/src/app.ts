import { preset } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import type { pumped } from "@pumped-fn/pumped"
import { actor, store, ParkingError, type Actor, type Role } from "@pumped-fn/parking-lot-shared"
import { createSqliteStore } from "@pumped-fn/parking-lot-shared/sqlite"

const faultStatus = { forbidden: 403, conflict: 409, "not-found": 404, unavailable: 409 } as const

function mapError(error: unknown): { status: number; body: unknown } | undefined {
  if (!(error instanceof ParkingError)) return undefined
  return { status: faultStatus[error.fault.kind], body: error.fault }
}

const database = createSqliteStore(process.env["PARKING_DB_PATH"] ?? "parking-lot.sqlite")
const logSink = logging.memory()
const obsSink = observable.memory()

function readRole(value: string | undefined): Role {
  if (value === "manager" || value === "operator" || value === "user") return value
  throw new Error(`unknown role: ${value ?? "missing"}`)
}

function contextTags(request?: Request) {
  const actorId = request?.headers.get("x-actor-id") ?? process.env["PARKING_ACTOR_ID"] ?? "anonymous"
  const role = readRole(request?.headers.get("x-role") ?? process.env["PARKING_ROLE"] ?? "manager")
  const value: Actor = { id: actorId, role }
  return [actor(value)]
}

export default {
  presets: [preset(store, database)],
  context: contextTags,
  extensions: [logging.extension(), observable.extension()],
  tags: [
    logging.runtime({ sinks: [logSink], level: "info", flow: "all" }),
    observable.runtime({ sinks: [obsSink], input: true }),
  ],
  mapError,
} satisfies pumped.Config
