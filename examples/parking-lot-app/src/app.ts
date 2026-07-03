import { FlowFault } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import type { pumped } from "@pumped-fn/pumped"
import { actor, dbPath, NotFoundError, type Actor, type Fault, type Role } from "@pumped-fn/parking-lot-shared"

const faultStatus = { forbidden: 403, conflict: 409, "not-found": 404, unavailable: 409 } satisfies Record<Fault["kind"], number>

function mapError(error: unknown): { status: number; body: unknown } | undefined {
  if (error instanceof FlowFault) return { status: faultStatus[(error.fault as Fault).kind], body: error.fault }
  if (error instanceof NotFoundError) return { status: 404, body: { kind: "not-found", entity: error.entity, id: error.id } }
  return undefined
}

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
  context: contextTags,
  extensions: [logging.extension(), observable.extension()],
  tags: [
    ...(process.env["PARKING_DB_PATH"] ? [dbPath(process.env["PARKING_DB_PATH"])] : []),
    logging.runtime({ sinks: [logSink], level: "info", flow: "all" }),
    observable.runtime({ sinks: [obsSink], input: true }),
  ],
  mapError,
} satisfies pumped.Config
