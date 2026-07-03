export type Fault =
  | { kind: "forbidden"; action: string; actorId: string }
  | { kind: "conflict"; entity: "booking" | "session" | "payment" | "dispute"; id: string; from: string; attempted: string }
  | { kind: "not-found"; entity: string; id: string }
  | { kind: "unavailable"; entity: "lot"; id: string; reason: "capacity" | "drive-up-capacity" }

export class ParkingError extends Error {
  constructor(readonly fault: Fault) {
    super(render(fault))
  }
}

export function render(fault: Fault): string {
  switch (fault.kind) {
    case "forbidden":
      return `actor ${fault.actorId} cannot ${fault.action}`
    case "conflict":
      return `${fault.entity} ${fault.id} cannot go from ${fault.from} to ${fault.attempted}`
    case "not-found":
      return `unknown ${fault.entity}: ${fault.id}`
    case "unavailable":
      return `${fault.entity} ${fault.id} has no ${fault.reason}`
  }
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
