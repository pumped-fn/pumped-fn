export type OperationalFaultKind =
  | "database-schema-drift"
  | "database-schema-not-current"
  | "unsupported-runtime-config"

export class OperationalFault extends Error {
  constructor(
    readonly kind: OperationalFaultKind,
    readonly operation: string,
    readonly entity: string,
    readonly details: Record<string, unknown>
  ) {
    super(`${kind}: ${operation} ${entity}`)
    this.name = "OperationalFault"
  }
}
