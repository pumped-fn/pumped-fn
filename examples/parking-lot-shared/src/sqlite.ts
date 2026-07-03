import { DatabaseSync } from "node:sqlite"
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
import type { ParkingStore } from "./store"
import { ParkingError, StoreError } from "./error"

type Kind =
  | "audit"
  | "booking"
  | "dispute"
  | "lot"
  | "payment"
  | "receipt"
  | "session"

interface Row {
  body: string
}

interface CounterRow {
  value: number
}

export class SqliteParkingStore implements ParkingStore {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS parking_documents (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (kind, id)
      );
      CREATE TABLE IF NOT EXISTS parking_counters (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
    `)
  }

  audit(id: string): AuditRecord {
    return this.read("audit", id)
  }

  audits(): AuditRecord[] {
    return this.list("audit")
  }

  booking(id: string): Booking {
    return this.read("booking", id)
  }

  bookings(): Booking[] {
    return this.list("booking")
  }

  close(): void {
    this.db.close()
  }

  dispute(id: string): Dispute {
    return this.read("dispute", id)
  }

  disputes(): Dispute[] {
    return this.list("dispute")
  }

  lot(id: string): Lot {
    return this.read("lot", id)
  }

  lots(): Lot[] {
    return this.list("lot")
  }

  nextId(prefix: string): string {
    const next = this.driver("counter", prefix, () => {
      const row = this.db.prepare("SELECT value FROM parking_counters WHERE name = ?").get(prefix) as CounterRow | undefined
      const value = (row?.value ?? 0) + 1
      this.db.prepare(`
        INSERT INTO parking_counters (name, value)
        VALUES (?, ?)
        ON CONFLICT(name) DO UPDATE SET value = excluded.value
      `).run(prefix, value)
      return value
    })
    return `${prefix}-${next.toString().padStart(4, "0")}`
  }

  payment(id: string): Payment {
    return this.read("payment", id)
  }

  payments(): Payment[] {
    return this.list("payment")
  }

  receipt(id: string): Receipt {
    return this.read("receipt", id)
  }

  receipts(): Receipt[] {
    return this.list("receipt")
  }

  saveAudit(record: AuditRecord): AuditRecord {
    return this.save("audit", record.id, record)
  }

  saveBooking(booking: Booking): Booking {
    return this.save("booking", booking.id, booking)
  }

  saveDispute(dispute: Dispute): Dispute {
    return this.save("dispute", dispute.id, dispute)
  }

  saveLot(lot: Lot): Lot {
    return this.save("lot", lot.id, lot)
  }

  savePayment(payment: Payment): Payment {
    return this.save("payment", payment.id, payment)
  }

  saveReceipt(receipt: Receipt): Receipt {
    return this.save("receipt", receipt.id, receipt)
  }

  saveSession(session: ParkingSession): ParkingSession {
    return this.save("session", session.id, session)
  }

  session(id: string): ParkingSession {
    return this.read("session", id)
  }

  sessions(): ParkingSession[] {
    return this.list("session")
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

  private list<T>(kind: Kind): T[] {
    const rows = this.driver("list", kind, () =>
      this.db.prepare("SELECT body FROM parking_documents WHERE kind = ? ORDER BY id").all(kind)
    )
    return rows.map((row) => JSON.parse((row as unknown as Row).body) as T)
  }

  private read<T>(kind: Kind, id: string): T {
    const row = this.driver("read", kind, () =>
      this.db.prepare("SELECT body FROM parking_documents WHERE kind = ? AND id = ?").get(kind, id)
    ) as Row | undefined
    if (row === undefined) throw new ParkingError({ kind: "not-found", entity: kind, id })
    return JSON.parse(row.body) as T
  }

  private save<T>(kind: Kind, id: string, value: T): T {
    this.driver("save", kind, () =>
      this.db.prepare(`
        INSERT INTO parking_documents (kind, id, body)
        VALUES (?, ?, ?)
        ON CONFLICT(kind, id) DO UPDATE SET body = excluded.body
      `).run(kind, id, JSON.stringify(value))
    )
    return value
  }

  private driver<T>(op: string, entity: string, run: () => T): T {
    try {
      return run()
    } catch (cause) {
      if (cause instanceof ParkingError) throw cause
      throw new StoreError(op, entity, cause)
    }
  }
}

export function createSqliteStore(path = ":memory:"): SqliteParkingStore {
  return new SqliteParkingStore(path)
}
