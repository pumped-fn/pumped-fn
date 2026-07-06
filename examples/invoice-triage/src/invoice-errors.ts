export type OperationalFaultKind =
  | "database-schema-drift"
  | "database-schema-not-current"
  | "unsupported-runtime-config"

export interface OperationalFault extends Error {
  readonly kind: OperationalFaultKind
  readonly operation: string
  readonly entity: string
  readonly details: Record<string, unknown>
}

export function operationalFault(
  kind: OperationalFaultKind,
  operation: string,
  entity: string,
  details: Record<string, unknown>
): OperationalFault {
  return Object.assign(new Error(`${kind}: ${operation} ${entity}`), {
    name: "OperationalFault",
    kind,
    operation,
    entity,
    details,
  })
}
