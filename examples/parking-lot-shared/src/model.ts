export type Role = "manager" | "operator" | "user"

export interface Actor {
  id: string
  role: Role
}

export interface LotSettings {
  bookingLeadMinutes: number
  currency: string
  graceMinutes: number
  refundWindowMinutes: number
}

export interface Lot {
  id: string
  name: string
  capacity: number
  rateCentsPerHour: number
  settings: LotSettings
}

export type BookingStatus = "held" | "checked_in" | "cancelled" | "completed"

export interface Booking {
  id: string
  lotId: string
  userId: string
  plate: string
  startAt: string
  endAt: string
  status: BookingStatus
  createdAt: string
  cancelledAt?: string
  sessionId?: string
}

export type SessionStatus = "parked" | "awaiting_payment" | "released"

export interface ParkingSession {
  id: string
  lotId: string
  plate: string
  userId?: string
  bookingId?: string
  enteredAt: string
  exitedAt?: string
  status: SessionStatus
}

export type PaymentStatus = "pending" | "failed" | "paired" | "refunded" | "disputed"

export interface Payment {
  id: string
  sessionId: string
  amountCents: number
  status: PaymentStatus
  createdAt: string
  method?: string
  externalRef?: string
  failureReason?: string
  pairedAt?: string
  refundedAt?: string
  disputedAt?: string
}

export type ReceiptType = "charge" | "refund" | "dispute"

export interface Receipt {
  id: string
  paymentId: string
  sessionId: string
  type: ReceiptType
  amountCents: number
  issuedAt: string
}

export type DisputeStatus = "open" | "accepted" | "rejected"

export interface Dispute {
  id: string
  paymentId: string
  userId: string
  reason: string
  status: DisputeStatus
  openedAt: string
  resolvedAt?: string
}

export interface AuditRecord {
  id: string
  actorId: string
  at: string
  data: Record<string, string | number | boolean | null>
  role: Role
  targetId: string
  type: string
}

export interface ParkingSnapshot {
  audits: AuditRecord[]
  bookings: Booking[]
  disputes: Dispute[]
  lots: Lot[]
  payments: Payment[]
  receipts: Receipt[]
  sessions: ParkingSession[]
}

export interface LotReport {
  lotId: string
  name: string
  capacity: number
  parked: number
  heldBookings: number
  awaitingPayment: number
  failedPayments: number
  openDisputes: number
  revenueCents: number
}

export interface Report {
  generatedAt: string
  lots: LotReport[]
  totals: {
    capacity: number
    failedPayments: number
    openDisputes: number
    parked: number
    revenueCents: number
  }
}

export const acceptedWorkflows = [
  "manager.configure-lot",
  "manager.read-report",
  "user.book-space",
  "user.cancel-booking",
  "operator.check-in-drive-up",
  "operator.check-in-booking",
  "operator.prepare-exit",
  "operator.pair-payment",
  "operator.record-payment-failure",
  "manager.refund-payment",
  "user.open-dispute",
  "manager.resolve-dispute",
] as const
