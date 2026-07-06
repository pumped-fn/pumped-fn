export type AuditAction =
  | "database.migrated"
  | "invoice.enqueued"
  | "invoice.drained"
  | "invoice.saved"
  | "invoice.reminded"

export interface AuditEvent {
  sequence: number
  action: AuditAction
  entityId: string
  occurredAt: string
  payload: Record<string, unknown>
}
