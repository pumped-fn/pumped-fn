import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"

type HoldStatus = "pending" | "printed" | "rejected"

type Hold = {
  holdId: number
  isbn: string
  copyId: string
  status: HoldStatus
  takenBy?: number
}

type Slip = {
  holdId: number
  copyId: string
}

type SessionRecord = {
  session: number
  slips: Slip[]
  closed: "clean" | "dirty"
}

type Shelf = {
  holds: Hold[]
  sessions: SessionRecord[]
  nextHoldId: number
  nextSession: number
  stopping: boolean
}

type HoldExists = { code: "HOLD_EXISTS" }
type PrinterJam = { code: "PRINTER_JAM" }

type SessionWork = {
  session: number
  holds: Hold[]
  slips: Slip[]
  jammedHoldId?: number
}

export const shelf = atom({
  factory: function createShelf(): Shelf {
    return { holds: [], sessions: [], nextHoldId: 1, nextSession: 1, stopping: false }
  },
})

export const wake = atom({
  keepAlive: true,
  factory: () => 0,
})

const printerSession = resource({
  name: "printer-session",
  ownership: "current",
  deps: { shelf: controller(shelf, { resolve: true }) },
  factory: (ctx, { shelf }): SessionWork => {
    let work!: SessionWork
    shelf.update((state) => {
      const session = state.nextSession
      const holds = state.holds.filter((hold) => hold.status === "pending" && hold.takenBy === undefined)
      work = { session, holds, slips: [] }
      return {
        ...state,
        holds: state.holds.map((hold) => holds.some((taken) => taken.holdId === hold.holdId)
          ? { ...hold, takenBy: session }
          : hold),
        nextSession: session + 1,
      }
    })
    ctx.onClose((result) => {
      shelf.update((state) => ({
        ...state,
        holds: state.holds.map((hold) => {
          if (hold.takenBy !== work.session) return hold
          if (result.ok) return { ...hold, status: "printed", takenBy: undefined }
          if (hold.holdId === work.jammedHoldId) return { ...hold, status: "rejected", takenBy: undefined }
          return { ...hold, takenBy: undefined }
        }),
        sessions: [...state.sessions, {
          session: work.session,
          slips: result.ok ? work.slips : [],
          closed: result.ok ? "clean" : "dirty",
        }],
      }))
    })
    return work
  },
})

function hasUnfulfilledHold(state: Shelf, copyId: string): boolean {
  return state.holds.some((hold) => hold.copyId === copyId && hold.status !== "printed")
}

function hasPendingHold(state: Shelf): boolean {
  return state.holds.some((hold) => hold.status === "pending" && hold.takenBy === undefined)
}

function isPrinterJam(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const fault = "fault" in error ? error.fault : undefined
  return typeof fault === "object" && fault !== null && "code" in fault && fault.code === "PRINTER_JAM"
}

export const recordReturn = flow({
  name: "record-return",
  parse: typed<{ isbn: string; copyId: string }>(),
  faults: typed<HoldExists>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
    wake: controller(wake, { resolve: true }),
  },
  factory: (ctx, { shelf, wake }) => {
    const { isbn, copyId } = ctx.input
    if (hasUnfulfilledHold(shelf.get(), copyId)) return ctx.fail({ code: "HOLD_EXISTS" })
    const holdId = shelf.get().nextHoldId
    shelf.update((state) => ({
      ...state,
      holds: [...state.holds, { holdId, isbn, copyId, status: "pending" }],
      nextHoldId: holdId + 1,
    }))
    wake.update((value) => value + 1)
    return { holdId }
  },
})

export const recordReturns = flow({
  name: "record-returns",
  parse: typed<{ returns: Array<{ isbn: string; copyId: string }> }>(),
  faults: typed<HoldExists>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
    wake: controller(wake, { resolve: true }),
  },
  factory: (ctx, { shelf, wake }) => {
    const copies = new Set<string>()
    const state = shelf.get()
    for (const returned of ctx.input.returns) {
      if (copies.has(returned.copyId) || hasUnfulfilledHold(state, returned.copyId)) {
        return ctx.fail({ code: "HOLD_EXISTS" })
      }
      copies.add(returned.copyId)
    }
    const holdIds = ctx.input.returns.map((_, index) => state.nextHoldId + index)
    shelf.update((current) => ({
      ...current,
      holds: [...current.holds, ...ctx.input.returns.map((returned, index) => ({
        holdId: holdIds[index]!,
        isbn: returned.isbn,
        copyId: returned.copyId,
        status: "pending" as const,
      }))],
      nextHoldId: current.nextHoldId + holdIds.length,
    }))
    wake.update((value) => value + 1)
    return { holdIds }
  },
})

export const drainPass = flow({
  name: "drain-pass",
  parse: typed<void>(),
  faults: typed<PrinterJam>(),
  deps: { printerSession },
  factory: (ctx, { printerSession }) => {
    for (const hold of printerSession.holds) {
      if (hold.isbn.length > 13) {
        printerSession.jammedHoldId = hold.holdId
        return ctx.fail({ code: "PRINTER_JAM" })
      }
      printerSession.slips.push({ holdId: hold.holdId, copyId: hold.copyId })
    }
    return { session: printerSession.session, printed: printerSession.slips.length }
  },
})

export const requestStop = flow({
  name: "request-stop",
  parse: typed<void>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
    wake: controller(wake, { resolve: true }),
  },
  factory: (_ctx, { shelf, wake }) => {
    shelf.update((state) => ({ ...state, stopping: true }))
    wake.update((value) => value + 1)
  },
})

export const runDispatcher = flow({
  name: "run-dispatcher",
  parse: typed<void>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
    drain: controller(drainPass),
  },
  factory: async (ctx, { shelf, drain }) => {
    let passes = 0
    let printed = 0
    const wakeups = ctx.changes(wake)[Symbol.asyncIterator]()
    const drainPending = async () => {
      while (hasPendingHold(shelf.get())) {
        try {
          const result = await drain.exec()
          passes += 1
          printed += result.printed
        } catch (error) {
          passes += 1
          if (!isPrinterJam(error)) throw error
        }
      }
    }
    let nextWake = wakeups.next()
    try {
      await drainPending()
      if (shelf.get().stopping && !hasPendingHold(shelf.get())) return { passes, printed }
      while (true) {
        await nextWake
        nextWake = wakeups.next()
        await drainPending()
        if (shelf.get().stopping && !hasPendingHold(shelf.get())) return { passes, printed }
      }
    } finally {
      await wakeups.return?.()
    }
  },
})

export const listHolds = flow({
  name: "list-holds",
  parse: typed<void>(),
  deps: { shelf },
  factory: (_ctx, { shelf }) => shelf.holds.map(({ holdId, isbn, copyId, status }) => ({ holdId, isbn, copyId, status })),
})

export const printerReport = flow({
  name: "printer-report",
  parse: typed<void>(),
  deps: { shelf },
  factory: (_ctx, { shelf }) => shelf.sessions.map((session) => ({ ...session, slips: [...session.slips] })),
})
