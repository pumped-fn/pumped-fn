import { controller, atom, flow, isFault, typed } from "@pumped-fn/lite"

export type HoldStatus = "pending" | "printed" | "rejected"

export interface Hold {
  holdId: number
  isbn: string
  copyId: string
  status: HoldStatus
}

interface HoldRow extends Hold {
  taken: boolean
}

interface ShelfState {
  holds: HoldRow[]
  nextHoldId: number
}

export interface PrinterSlip {
  holdId: number
  copyId: string
}

export interface PrinterSession {
  session: number
  slips: PrinterSlip[]
  closed: "clean" | "dirty"
}

interface PrinterState {
  sessions: PrinterSession[]
  nextSession: number
}

type HoldExistsFault = { code: "HOLD_EXISTS"; copyId: string }
type PrinterJamFault = { code: "PRINTER_JAM"; holdId: number; isbn: string }

const shelf = atom({
  keepAlive: true,
  factory: (): ShelfState => ({ holds: [], nextHoldId: 1 }),
})

const printer = atom({
  keepAlive: true,
  factory: (): PrinterState => ({ sessions: [], nextSession: 1 }),
})

const wake = atom({
  keepAlive: true,
  factory: () => 0,
})

const stopping = atom({
  keepAlive: true,
  factory: () => false,
})

function hasPending(state: ShelfState): boolean {
  return state.holds.some((hold) => hold.status === "pending" && !hold.taken)
}

export const recordReturn = flow({
  name: "record-return",
  parse: typed<{ isbn: string; copyId: string }>(),
  faults: typed<HoldExistsFault>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
    wake: controller(wake, { resolve: true }),
  },
  factory: (ctx, { shelf, wake }) => {
    const current = shelf.get()
    if (current.holds.some((hold) => hold.copyId === ctx.input.copyId && hold.status === "pending")) {
      return ctx.fail({ code: "HOLD_EXISTS", copyId: ctx.input.copyId })
    }
    const holdId = current.nextHoldId
    shelf.update((prev) => ({
      holds: [
        ...prev.holds,
        { holdId, isbn: ctx.input.isbn, copyId: ctx.input.copyId, status: "pending", taken: false },
      ],
      nextHoldId: prev.nextHoldId + 1,
    }))
    wake.update((n) => n + 1)
    return { holdId }
  },
})

export const recordReturns = flow({
  name: "record-returns",
  parse: typed<{ returns: Array<{ isbn: string; copyId: string }> }>(),
  faults: typed<HoldExistsFault>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
    wake: controller(wake, { resolve: true }),
  },
  factory: (ctx, { shelf, wake }) => {
    const current = shelf.get()
    const heldCopyIds = new Set(
      current.holds.filter((hold) => hold.status === "pending").map((hold) => hold.copyId),
    )
    const seen = new Set<string>()
    for (const entry of ctx.input.returns) {
      if (heldCopyIds.has(entry.copyId) || seen.has(entry.copyId)) {
        return ctx.fail({ code: "HOLD_EXISTS", copyId: entry.copyId })
      }
      seen.add(entry.copyId)
    }
    const holdIds: number[] = []
    shelf.update((prev) => {
      let nextHoldId = prev.nextHoldId
      const newRows = ctx.input.returns.map((entry) => {
        const holdId = nextHoldId
        nextHoldId += 1
        holdIds.push(holdId)
        return { holdId, isbn: entry.isbn, copyId: entry.copyId, status: "pending" as const, taken: false }
      })
      return { holds: [...prev.holds, ...newRows], nextHoldId }
    })
    wake.update((n) => n + 1)
    return { holdIds }
  },
})

export const drainPass = flow({
  name: "drain-pass",
  parse: typed<void>(),
  faults: typed<PrinterJamFault>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
    printer: controller(printer, { resolve: true }),
  },
  factory: (ctx, { shelf, printer }) => {
    let claimed: HoldRow[] = []
    shelf.update((prev) => {
      claimed = prev.holds.filter((hold) => hold.status === "pending" && !hold.taken)
      if (claimed.length === 0) return prev
      const claimedIds = new Set(claimed.map((hold) => hold.holdId))
      return {
        ...prev,
        holds: prev.holds.map((hold) => (claimedIds.has(hold.holdId) ? { ...hold, taken: true } : hold)),
      }
    })

    let session = 0
    printer.update((prev) => {
      session = prev.nextSession
      return { ...prev, nextSession: prev.nextSession + 1 }
    })

    const claimedIds = new Set(claimed.map((hold) => hold.holdId))
    const slips: PrinterSlip[] = []
    let jam: PrinterJamFault | undefined
    for (const hold of claimed) {
      if (hold.isbn.length > 13) {
        jam = { code: "PRINTER_JAM", holdId: hold.holdId, isbn: hold.isbn }
        break
      }
      slips.push({ holdId: hold.holdId, copyId: hold.copyId })
    }

    if (jam) {
      const jammedHoldId = jam.holdId
      printer.update((prev) => ({
        ...prev,
        sessions: [...prev.sessions, { session, slips: [], closed: "dirty" }],
      }))
      shelf.update((prev) => ({
        ...prev,
        holds: prev.holds.map((hold) => {
          if (!claimedIds.has(hold.holdId)) return hold
          if (hold.holdId === jammedHoldId) return { ...hold, status: "rejected", taken: false }
          return { ...hold, taken: false }
        }),
      }))
      return ctx.fail(jam)
    }

    printer.update((prev) => ({
      ...prev,
      sessions: [...prev.sessions, { session, slips, closed: "clean" }],
    }))
    shelf.update((prev) => ({
      ...prev,
      holds: prev.holds.map((hold) =>
        claimedIds.has(hold.holdId) ? { ...hold, status: "printed", taken: false } : hold,
      ),
    }))
    return { session, printed: claimed.length }
  },
})

export const runDispatcher = flow({
  name: "run-dispatcher",
  parse: typed<void>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
    stopping: controller(stopping, { resolve: true }),
    drain: controller(drainPass),
  },
  factory: async (ctx, { shelf, stopping, drain }) => {
    const wakeIterator = ctx.changes(wake)[Symbol.asyncIterator]()
    let passes = 0
    let printed = 0
    for (;;) {
      while (hasPending(shelf.get())) {
        try {
          const result = await drain.exec()
          passes += 1
          printed += result.printed
        } catch (error) {
          if (!isFault(drainPass, error)) throw error
          passes += 1
        }
      }
      if (stopping.get()) break
      await wakeIterator.next()
    }
    return { passes, printed }
  },
})

export const requestStop = flow({
  name: "request-stop",
  parse: typed<void>(),
  deps: {
    stopping: controller(stopping, { resolve: true }),
    wake: controller(wake, { resolve: true }),
  },
  factory: (_ctx, { stopping, wake }) => {
    stopping.set(true)
    wake.update((n) => n + 1)
  },
})

export const listHolds = flow({
  name: "list-holds",
  parse: typed<void>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
  },
  factory: (_ctx, { shelf }): Hold[] =>
    shelf.get().holds.map((hold) => ({
      holdId: hold.holdId,
      isbn: hold.isbn,
      copyId: hold.copyId,
      status: hold.status,
    })),
})

export const printerReport = flow({
  name: "printer-report",
  parse: typed<void>(),
  deps: {
    printer: controller(printer, { resolve: true }),
  },
  factory: (_ctx, { printer }): PrinterSession[] =>
    printer.get().sessions.map((session) => ({
      session: session.session,
      slips: session.slips.map((slip) => ({ ...slip })),
      closed: session.closed,
    })),
})
