import type {
  AuditRecord,
  Booking,
  Dispute,
  Lot,
  ParkingSession,
  ParkingSnapshot,
  Payment,
  Receipt,
} from "./model"
import { ParkingError } from "./error"

export interface ParkingStore {
  audit(id: string): AuditRecord
  audits(): AuditRecord[]
  booking(id: string): Booking
  bookings(): Booking[]
  dispute(id: string): Dispute
  disputes(): Dispute[]
  lot(id: string): Lot
  lots(): Lot[]
  nextId(prefix: string): string
  payment(id: string): Payment
  payments(): Payment[]
  receipt(id: string): Receipt
  receipts(): Receipt[]
  saveAudit(record: AuditRecord): AuditRecord
  saveBooking(booking: Booking): Booking
  saveDispute(dispute: Dispute): Dispute
  saveLot(lot: Lot): Lot
  savePayment(payment: Payment): Payment
  saveReceipt(receipt: Receipt): Receipt
  saveSession(session: ParkingSession): ParkingSession
  session(id: string): ParkingSession
  sessions(): ParkingSession[]
  snapshot(): ParkingSnapshot
}

type Kind =
  | "audit"
  | "booking"
  | "dispute"
  | "lot"
  | "payment"
  | "receipt"
  | "session"

type Entity =
  | AuditRecord
  | Booking
  | Dispute
  | Lot
  | ParkingSession
  | Payment
  | Receipt

export class MemoryParkingStore implements ParkingStore {
  private readonly auditRecords = new Map<string, AuditRecord>()
  private readonly bookingRecords = new Map<string, Booking>()
  private readonly disputeRecords = new Map<string, Dispute>()
  private readonly lotRecords = new Map<string, Lot>()
  private readonly paymentRecords = new Map<string, Payment>()
  private readonly receiptRecords = new Map<string, Receipt>()
  private readonly sessionRecords = new Map<string, ParkingSession>()
  private readonly counters = new Map<string, number>()

  audit(id: string): AuditRecord {
    return this.must(this.auditRecords, id, "audit")
  }

  audits(): AuditRecord[] {
    return [...this.auditRecords.values()]
  }

  booking(id: string): Booking {
    return this.must(this.bookingRecords, id, "booking")
  }

  bookings(): Booking[] {
    return [...this.bookingRecords.values()]
  }

  dispute(id: string): Dispute {
    return this.must(this.disputeRecords, id, "dispute")
  }

  disputes(): Dispute[] {
    return [...this.disputeRecords.values()]
  }

  lot(id: string): Lot {
    return this.must(this.lotRecords, id, "lot")
  }

  lots(): Lot[] {
    return [...this.lotRecords.values()]
  }

  nextId(prefix: string): string {
    const next = (this.counters.get(prefix) ?? 0) + 1
    this.counters.set(prefix, next)
    return `${prefix}-${next.toString().padStart(4, "0")}`
  }

  payment(id: string): Payment {
    return this.must(this.paymentRecords, id, "payment")
  }

  payments(): Payment[] {
    return [...this.paymentRecords.values()]
  }

  receipt(id: string): Receipt {
    return this.must(this.receiptRecords, id, "receipt")
  }

  receipts(): Receipt[] {
    return [...this.receiptRecords.values()]
  }

  saveAudit(record: AuditRecord): AuditRecord {
    this.auditRecords.set(record.id, record)
    return record
  }

  saveBooking(booking: Booking): Booking {
    this.bookingRecords.set(booking.id, booking)
    return booking
  }

  saveDispute(dispute: Dispute): Dispute {
    this.disputeRecords.set(dispute.id, dispute)
    return dispute
  }

  saveLot(lot: Lot): Lot {
    this.lotRecords.set(lot.id, lot)
    return lot
  }

  savePayment(payment: Payment): Payment {
    this.paymentRecords.set(payment.id, payment)
    return payment
  }

  saveReceipt(receipt: Receipt): Receipt {
    this.receiptRecords.set(receipt.id, receipt)
    return receipt
  }

  saveSession(session: ParkingSession): ParkingSession {
    this.sessionRecords.set(session.id, session)
    return session
  }

  session(id: string): ParkingSession {
    return this.must(this.sessionRecords, id, "session")
  }

  sessions(): ParkingSession[] {
    return [...this.sessionRecords.values()]
  }

  snapshot(): ParkingSnapshot {
    return {
      audits: this.audits(),
      bookings: this.bookings(),
      disputes: this.disputes(),
      lots: this.lots(),
      payments: this.payments(),
      receipts: this.receipts(),
      sessions: this.sessions(),
    }
  }

  private must<T extends Entity>(records: Map<string, T>, id: string, kind: Kind): T {
    const record = records.get(id)
    if (record === undefined) throw new ParkingError({ kind: "not-found", entity: kind, id })
    return record
  }
}

export function createMemoryStore(): ParkingStore {
  return new MemoryParkingStore()
}
