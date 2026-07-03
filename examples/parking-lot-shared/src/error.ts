export type Fault =
  | { kind: "forbidden"; action: string; actorId: string }
  | { kind: "conflict"; entity: "booking" | "session" | "payment" | "dispute"; id: string; from: string; attempted: string }
  | { kind: "not-found"; entity: string; id: string }
  | { kind: "unavailable"; entity: "lot"; id: string; reason: "capacity" | "drive-up-capacity" }

export class StoreError extends Error {
  constructor(
    readonly op: string,
    readonly entity: string,
    override readonly cause: unknown
  ) {
    super(`${op} ${entity} failed: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}
