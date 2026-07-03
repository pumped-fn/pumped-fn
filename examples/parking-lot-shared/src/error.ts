import { FlowFault } from "@pumped-fn/lite"
import { NotFoundError } from "./store"

export type Fault =
  | { kind: "forbidden"; action: string; actorId: string }
  | { kind: "conflict"; entity: "booking" | "session" | "payment" | "dispute"; id: string; from: string; attempted: string }
  | { kind: "not-found"; entity: string; id: string }
  | { kind: "unavailable"; entity: "lot"; id: string; reason: "capacity" | "drive-up-capacity" }

export type Forbidden = Extract<Fault, { kind: "forbidden" }>
export type Conflict = Extract<Fault, { kind: "conflict" }>
export type NotFound = Extract<Fault, { kind: "not-found" }>
export type Unavailable = Extract<Fault, { kind: "unavailable" }>

export const faultStatus = {
  forbidden: 403,
  conflict: 409,
  "not-found": 404,
  unavailable: 409,
} satisfies Record<Fault["kind"], number>

export function isParkingFault(error: unknown): error is FlowFault & { fault: Fault } {
  return error instanceof FlowFault
}

export function mapError(error: unknown): { status: number; body: unknown } | undefined {
  if (isParkingFault(error)) return { status: faultStatus[error.fault.kind], body: error.fault }
  if (error instanceof NotFoundError) return { status: 404, body: { kind: "not-found", entity: error.entity, id: error.id } }
  return undefined
}

export class StoreError extends Error {
  constructor(
    readonly op: string,
    readonly entity: string,
    override readonly cause: unknown
  ) {
    super(`${op} ${entity} failed: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}
