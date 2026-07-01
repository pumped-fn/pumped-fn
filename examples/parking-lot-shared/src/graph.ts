import { atom, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import type {
  Actor,
  AuditRecord,
  Booking,
  Dispute,
  Lot,
  LotReport,
  ParkingSession,
  Payment,
  Receipt,
  Report,
  Role,
} from "./model"
import { createMemoryStore, type ParkingStore } from "./store"

export const actor = tag<Actor>({ label: "parking.actor" })

export const now = tag<() => string>({
  default: () => new Date().toISOString(),
  label: "parking.now",
})

export const store = atom({
  factory: () => createMemoryStore(),
})

interface Work {
  actor: Actor
  at(): string
  id(prefix: string): string
  record(type: string, targetId: string, data?: Record<string, string | number | boolean | null>): void
  store: ParkingStore
}

export const tx = resource({
  name: "parking.tx",
  ownership: "current",
  deps: {
    actor: tags.required(actor),
    now: tags.required(now),
    store,
  },
  factory: (ctx, deps): Work => {
    const events: AuditRecord[] = []
    ctx.cleanup(() => {
      for (const event of events) deps.store.saveAudit(event)
    })
    return {
      actor: deps.actor,
      at: deps.now,
      id: (prefix) => deps.store.nextId(prefix),
      record: (type, targetId, data = {}) => {
        events.push({
          actorId: deps.actor.id,
          at: deps.now(),
          data,
          id: deps.store.nextId("audit"),
          role: deps.actor.role,
          targetId,
          type,
        })
      },
      store: deps.store,
    }
  },
})

export interface ConfigureLotInput {
  bookingLeadMinutes: number
  capacity: number
  currency: string
  graceMinutes: number
  lotId?: string
  name: string
  rateCentsPerHour: number
  refundWindowMinutes: number
}

export interface BookSpaceInput {
  endAt: string
  lotId: string
  plate: string
  startAt: string
}

export interface CancelBookingInput {
  bookingId: string
}

export interface CheckInVehicleInput {
  lotId: string
  plate: string
  userId?: string
}

export interface CheckInBookingInput {
  bookingId: string
}

export interface PrepareExitInput {
  sessionId: string
}

export interface PairPaymentInput {
  externalRef: string
  method: string
  paymentId: string
}

export interface RecordPaymentFailureInput {
  paymentId: string
  reason: string
}

export interface RefundPaymentInput {
  paymentId: string
  reason: string
}

export interface OpenDisputeInput {
  paymentId: string
  reason: string
}

export interface ResolveDisputeInput {
  decision: "accepted" | "rejected"
  disputeId: string
}

export interface ReadReportInput {
  lotId?: string
}

export interface ListReceiptsInput {
  userId?: string
}

export const configureLot = flow({
  name: "parking.configure-lot",
  parse: typed<ConfigureLotInput>(),
  deps: { tx },
  factory: (ctx, deps): Lot => {
    allow(deps.tx.actor, ["manager"], "configure lot")
    const lot: Lot = {
      capacity: ctx.input.capacity,
      id: ctx.input.lotId ?? deps.tx.id("lot"),
      name: ctx.input.name,
      rateCentsPerHour: ctx.input.rateCentsPerHour,
      settings: {
        bookingLeadMinutes: ctx.input.bookingLeadMinutes,
        currency: ctx.input.currency,
        graceMinutes: ctx.input.graceMinutes,
        refundWindowMinutes: ctx.input.refundWindowMinutes,
      },
    }
    deps.tx.store.saveLot(lot)
    deps.tx.record("lot.configured", lot.id, { capacity: lot.capacity, rateCentsPerHour: lot.rateCentsPerHour })
    return lot
  },
})

export const bookSpace = flow({
  name: "parking.book-space",
  parse: typed<BookSpaceInput>(),
  deps: { tx },
  factory: (ctx, deps): Booking => {
    allow(deps.tx.actor, ["user"], "book space")
    const lot = deps.tx.store.lot(ctx.input.lotId)
    assertCapacity(deps.tx.store, lot, ctx.input.startAt, ctx.input.endAt)
    const booking: Booking = {
      createdAt: deps.tx.at(),
      endAt: ctx.input.endAt,
      id: deps.tx.id("booking"),
      lotId: lot.id,
      plate: normalizePlate(ctx.input.plate),
      startAt: ctx.input.startAt,
      status: "held",
      userId: deps.tx.actor.id,
    }
    deps.tx.store.saveBooking(booking)
    deps.tx.record("booking.held", booking.id, { lotId: lot.id, userId: booking.userId })
    return booking
  },
})

export const cancelBooking = flow({
  name: "parking.cancel-booking",
  parse: typed<CancelBookingInput>(),
  deps: { tx },
  factory: (ctx, deps): Booking => {
    const booking = deps.tx.store.booking(ctx.input.bookingId)
    if (deps.tx.actor.role !== "manager" && deps.tx.actor.id !== booking.userId) {
      throw new Error(`role ${deps.tx.actor.role} cannot cancel booking ${booking.id}`)
    }
    if (booking.status !== "held") throw new Error(`booking ${booking.id} is not held`)
    const next = deps.tx.store.saveBooking({
      ...booking,
      cancelledAt: deps.tx.at(),
      status: "cancelled",
    })
    deps.tx.record("booking.cancelled", next.id, { userId: next.userId })
    return next
  },
})

export const checkInVehicle = flow({
  name: "parking.check-in-vehicle",
  parse: typed<CheckInVehicleInput>(),
  deps: { tx },
  factory: (ctx, deps): ParkingSession => {
    allow(deps.tx.actor, ["operator"], "check in vehicle")
    const lot = deps.tx.store.lot(ctx.input.lotId)
    assertDriveUpCapacity(deps.tx.store, lot)
    const session: ParkingSession = {
      enteredAt: deps.tx.at(),
      id: deps.tx.id("session"),
      lotId: lot.id,
      plate: normalizePlate(ctx.input.plate),
      status: "parked",
      userId: ctx.input.userId,
    }
    deps.tx.store.saveSession(session)
    deps.tx.record("session.parked", session.id, { lotId: lot.id, plate: session.plate })
    return session
  },
})

export const checkInBooking = flow({
  name: "parking.check-in-booking",
  parse: typed<CheckInBookingInput>(),
  deps: { tx },
  factory: (ctx, deps): ParkingSession => {
    allow(deps.tx.actor, ["operator"], "check in booking")
    const booking = deps.tx.store.booking(ctx.input.bookingId)
    if (booking.status !== "held") throw new Error(`booking ${booking.id} is not held`)
    const lot = deps.tx.store.lot(booking.lotId)
    assertDriveUpCapacity(deps.tx.store, lot)
    const session: ParkingSession = {
      bookingId: booking.id,
      enteredAt: deps.tx.at(),
      id: deps.tx.id("session"),
      lotId: lot.id,
      plate: booking.plate,
      status: "parked",
      userId: booking.userId,
    }
    deps.tx.store.saveSession(session)
    deps.tx.store.saveBooking({ ...booking, sessionId: session.id, status: "checked_in" })
    deps.tx.record("booking.checked-in", booking.id, { sessionId: session.id })
    return session
  },
})

export const prepareExit = flow({
  name: "parking.prepare-exit",
  parse: typed<PrepareExitInput>(),
  deps: { tx },
  factory: (ctx, deps): { payment: Payment; session: ParkingSession } => {
    allow(deps.tx.actor, ["operator"], "prepare exit")
    const session = deps.tx.store.session(ctx.input.sessionId)
    if (session.status !== "parked") throw new Error(`session ${session.id} is not parked`)
    const exitedAt = deps.tx.at()
    const lot = deps.tx.store.lot(session.lotId)
    const payment: Payment = {
      amountCents: amountDue(lot, session.enteredAt, exitedAt),
      createdAt: exitedAt,
      id: deps.tx.id("payment"),
      sessionId: session.id,
      status: "pending",
    }
    const next = deps.tx.store.saveSession({ ...session, exitedAt, status: "awaiting_payment" })
    deps.tx.store.savePayment(payment)
    completeBookingForSession(deps.tx.store, next)
    deps.tx.record("session.exit-prepared", next.id, { amountCents: payment.amountCents, paymentId: payment.id })
    return { payment, session: next }
  },
})

export const pairPayment = flow({
  name: "parking.pair-payment",
  parse: typed<PairPaymentInput>(),
  deps: { tx },
  factory: (ctx, deps): { payment: Payment; receipt: Receipt; session: ParkingSession } => {
    allow(deps.tx.actor, ["operator"], "pair payment")
    const payment = deps.tx.store.payment(ctx.input.paymentId)
    if (payment.status !== "pending" && payment.status !== "failed") {
      throw new Error(`payment ${payment.id} cannot be paired from ${payment.status}`)
    }
    const session = deps.tx.store.session(payment.sessionId)
    const paired: Payment = {
      ...payment,
      externalRef: ctx.input.externalRef,
      method: ctx.input.method,
      pairedAt: deps.tx.at(),
      status: "paired",
    }
    const receipt = issueReceipt(deps.tx, paired, "charge", paired.amountCents)
    const released = deps.tx.store.saveSession({ ...session, status: "released" })
    deps.tx.store.savePayment(paired)
    deps.tx.record("payment.paired", paired.id, { amountCents: paired.amountCents, receiptId: receipt.id })
    return { payment: paired, receipt, session: released }
  },
})

export const recordPaymentFailure = flow({
  name: "parking.record-payment-failure",
  parse: typed<RecordPaymentFailureInput>(),
  deps: { tx },
  factory: (ctx, deps): Payment => {
    allow(deps.tx.actor, ["operator"], "record payment failure")
    const payment = deps.tx.store.payment(ctx.input.paymentId)
    if (payment.status !== "pending") throw new Error(`payment ${payment.id} is not pending`)
    const failed = deps.tx.store.savePayment({
      ...payment,
      failureReason: ctx.input.reason,
      status: "failed",
    })
    deps.tx.record("payment.failed", failed.id, { reason: ctx.input.reason })
    return failed
  },
})

export const refundPayment = flow({
  name: "parking.refund-payment",
  parse: typed<RefundPaymentInput>(),
  deps: { tx },
  factory: (ctx, deps): { payment: Payment; receipt: Receipt } => {
    allow(deps.tx.actor, ["manager"], "refund payment")
    const payment = deps.tx.store.payment(ctx.input.paymentId)
    if (payment.status !== "paired" && payment.status !== "disputed") {
      throw new Error(`payment ${payment.id} cannot be refunded from ${payment.status}`)
    }
    const refunded = deps.tx.store.savePayment({
      ...payment,
      refundedAt: deps.tx.at(),
      status: "refunded",
    })
    const receipt = issueReceipt(deps.tx, refunded, "refund", -refunded.amountCents)
    deps.tx.record("payment.refunded", refunded.id, { reason: ctx.input.reason, receiptId: receipt.id })
    return { payment: refunded, receipt }
  },
})

export const openDispute = flow({
  name: "parking.open-dispute",
  parse: typed<OpenDisputeInput>(),
  deps: { tx },
  factory: (ctx, deps): { dispute: Dispute; payment: Payment; receipt: Receipt } => {
    allow(deps.tx.actor, ["user"], "open dispute")
    const payment = deps.tx.store.payment(ctx.input.paymentId)
    const session = deps.tx.store.session(payment.sessionId)
    if (session.userId !== deps.tx.actor.id) throw new Error(`user ${deps.tx.actor.id} cannot dispute payment ${payment.id}`)
    if (payment.status !== "paired") throw new Error(`payment ${payment.id} cannot be disputed from ${payment.status}`)
    const disputed = deps.tx.store.savePayment({
      ...payment,
      disputedAt: deps.tx.at(),
      status: "disputed",
    })
    const dispute: Dispute = deps.tx.store.saveDispute({
      id: deps.tx.id("dispute"),
      openedAt: deps.tx.at(),
      paymentId: payment.id,
      reason: ctx.input.reason,
      status: "open",
      userId: deps.tx.actor.id,
    })
    const receipt = issueReceipt(deps.tx, disputed, "dispute", 0)
    deps.tx.record("payment.disputed", disputed.id, { disputeId: dispute.id, receiptId: receipt.id })
    return { dispute, payment: disputed, receipt }
  },
})

export const resolveDispute = flow({
  name: "parking.resolve-dispute",
  parse: typed<ResolveDisputeInput>(),
  deps: { tx },
  factory: (ctx, deps): { dispute: Dispute; payment: Payment; receipt?: Receipt } => {
    allow(deps.tx.actor, ["manager"], "resolve dispute")
    const dispute = deps.tx.store.dispute(ctx.input.disputeId)
    if (dispute.status !== "open") throw new Error(`dispute ${dispute.id} is not open`)
    const payment = deps.tx.store.payment(dispute.paymentId)
    const resolved = deps.tx.store.saveDispute({
      ...dispute,
      resolvedAt: deps.tx.at(),
      status: ctx.input.decision,
    })
    if (ctx.input.decision === "rejected") {
      const paired = deps.tx.store.savePayment({ ...payment, status: "paired" })
      deps.tx.record("dispute.rejected", resolved.id, { paymentId: payment.id })
      return { dispute: resolved, payment: paired }
    }
    const refunded = deps.tx.store.savePayment({
      ...payment,
      refundedAt: deps.tx.at(),
      status: "refunded",
    })
    const receipt = issueReceipt(deps.tx, refunded, "refund", -refunded.amountCents)
    deps.tx.record("dispute.accepted", resolved.id, { paymentId: payment.id, receiptId: receipt.id })
    return { dispute: resolved, payment: refunded, receipt }
  },
})

export const listReceipts = flow({
  name: "parking.list-receipts",
  parse: typed<ListReceiptsInput>(),
  deps: { tx },
  factory: (ctx, deps): Receipt[] => {
    const requestedUser = ctx.input.userId ?? deps.tx.actor.id
    if (deps.tx.actor.role === "user" && requestedUser !== deps.tx.actor.id) {
      throw new Error(`user ${deps.tx.actor.id} cannot read receipts for ${requestedUser}`)
    }
    return deps.tx.store.receipts().filter((receipt) => {
      if (deps.tx.actor.role !== "user") return true
      return deps.tx.store.session(receipt.sessionId).userId === requestedUser
    })
  },
})

export const readReport = flow({
  name: "parking.read-report",
  parse: typed<ReadReportInput>(),
  deps: { tx },
  factory: (ctx, deps): Report => {
    allow(deps.tx.actor, ["manager"], "read report")
    const lots = deps.tx.store.lots()
      .filter((lot) => ctx.input.lotId === undefined || lot.id === ctx.input.lotId)
      .map((lot): LotReport => {
        const sessions = deps.tx.store.sessions().filter((session) => session.lotId === lot.id)
        const payments = deps.tx.store.payments().filter((payment) => sessions.some((session) => session.id === payment.sessionId))
        const disputes = deps.tx.store.disputes().filter((dispute) => payments.some((payment) => payment.id === dispute.paymentId))
        return {
          awaitingPayment: sessions.filter((session) => session.status === "awaiting_payment").length,
          capacity: lot.capacity,
          failedPayments: payments.filter((payment) => payment.status === "failed").length,
          heldBookings: deps.tx.store.bookings().filter((booking) => booking.lotId === lot.id && booking.status === "held").length,
          lotId: lot.id,
          name: lot.name,
          openDisputes: disputes.filter((dispute) => dispute.status === "open").length,
          parked: sessions.filter((session) => session.status === "parked").length,
          revenueCents: deps.tx.store.receipts().filter((receipt) => receipt.type === "charge").reduce((sum, receipt) => sum + receipt.amountCents, 0),
        }
      })
    return {
      generatedAt: deps.tx.at(),
      lots,
      totals: {
        capacity: lots.reduce((sum, lot) => sum + lot.capacity, 0),
        failedPayments: lots.reduce((sum, lot) => sum + lot.failedPayments, 0),
        openDisputes: lots.reduce((sum, lot) => sum + lot.openDisputes, 0),
        parked: lots.reduce((sum, lot) => sum + lot.parked, 0),
        revenueCents: lots.reduce((sum, lot) => sum + lot.revenueCents, 0),
      },
    }
  },
})

function allow(actor: Actor, roles: readonly Role[], action: string): void {
  if (!roles.includes(actor.role)) throw new Error(`role ${actor.role} cannot ${action}`)
}

function amountDue(lot: Lot, enteredAt: string, exitedAt: string): number {
  const minutes = Math.max(0, Math.ceil((Date.parse(exitedAt) - Date.parse(enteredAt)) / 60000))
  const billable = Math.max(0, minutes - lot.settings.graceMinutes)
  return billable === 0 ? 0 : Math.max(1, Math.ceil(billable / 60)) * lot.rateCentsPerHour
}

function assertCapacity(store: ParkingStore, lot: Lot, startAt: string, endAt: string): void {
  const held = store.bookings().filter((booking) =>
    booking.lotId === lot.id &&
    booking.status === "held" &&
    overlaps(startAt, endAt, booking.startAt, booking.endAt)
  ).length
  const parked = parkedCount(store, lot.id)
  if (held + parked >= lot.capacity) throw new Error(`lot ${lot.id} has no reservable capacity`)
}

function assertDriveUpCapacity(store: ParkingStore, lot: Lot): void {
  if (parkedCount(store, lot.id) >= lot.capacity) throw new Error(`lot ${lot.id} is full`)
}

function completeBookingForSession(store: ParkingStore, session: ParkingSession): void {
  if (session.bookingId === undefined) return
  const booking = store.booking(session.bookingId)
  store.saveBooking({ ...booking, status: "completed" })
}

function issueReceipt(work: Work, payment: Payment, type: Receipt["type"], amountCents: number): Receipt {
  return work.store.saveReceipt({
    amountCents,
    id: work.id("receipt"),
    issuedAt: work.at(),
    paymentId: payment.id,
    sessionId: payment.sessionId,
    type,
  })
}

function normalizePlate(value: string): string {
  return value.trim().toUpperCase()
}

function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return Date.parse(leftStart) < Date.parse(rightEnd) && Date.parse(rightStart) < Date.parse(leftEnd)
}

function parkedCount(store: ParkingStore, lotId: string): number {
  return store.sessions().filter((session) => session.lotId === lotId && session.status === "parked").length
}
