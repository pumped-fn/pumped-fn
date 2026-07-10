import { atom, controller, flow, typed } from "@pumped-fn/lite"

export type HoldStatus = "pending" | "printed" | "rejected"
export type Hold = { holdId: number; isbn: string; copyId: string; status: HoldStatus }
export type Slip = { holdId: number; copyId: string }
export type SessionRecord = { session: number; slips: Slip[]; closed: "clean" | "dirty" }
export type Return = { isbn: string; copyId: string }

type Fault = { code: "HOLD_EXISTS"; copyId: string } | { code: "PRINTER_JAM"; holdId: number }

type Shelf = { holds: Hold[]; nextHoldId: number }

const shelf = atom({
  keepAlive: true,
  factory: (): Shelf => ({ holds: [], nextHoldId: 1 }),
})

const holdSignal = atom({
  keepAlive: true,
  factory: (): number => 0,
})

const stopping = atom({
  keepAlive: true,
  factory: (): boolean => false,
})

const printerLog = atom({
  keepAlive: true,
  factory: () => ({ sessions: [] as SessionRecord[], nextSession: 1 }),
})

const unfulfilled = (shelf: Shelf, copyId: string) =>
  shelf.holds.some((hold) => hold.copyId === copyId && hold.status === "pending")

export const recordReturn = flow({
  name: "holds.enqueue",
  parse: typed<Return>(),
  faults: typed<Fault>(),
  deps: { shelf, signal: controller(holdSignal, { resolve: true }) },
  factory: (ctx, { shelf, signal }) => {
    const { isbn, copyId } = ctx.input
    if (unfulfilled(shelf, copyId)) return ctx.fail({ code: "HOLD_EXISTS", copyId })
    const hold: Hold = { holdId: shelf.nextHoldId, isbn, copyId, status: "pending" }
    shelf.nextHoldId += 1
    shelf.holds.push(hold)
    signal.update((value) => value + 1)
    return { holdId: hold.holdId }
  },
})

export const recordReturns = flow({
  name: "holds.intake",
  parse: typed<{ returns: Return[] }>(),
  faults: typed<Fault>(),
  deps: { enqueue: controller(recordReturn) },
  factory: async (ctx, { enqueue }) => {
    const holdIds: number[] = []
    for (const line of ctx.input.returns) {
      holdIds.push((await enqueue.exec({ input: line })).holdId)
    }
    return { holdIds }
  },
})

export const drainPass = flow({
  name: "holds.importBatch",
  parse: typed<void>(),
  faults: typed<Fault>(),
  deps: { shelf, printerLog },
  factory: async (ctx, { shelf, printerLog }) => {
    const session = printerLog.nextSession
    printerLog.nextSession += 1
    const record: SessionRecord = { session, slips: [], closed: "clean" }
    const batch = shelf.holds.filter((hold) => hold.status === "pending")
    try {
      for (const hold of batch) {
        if (hold.isbn.length > 13) {
          record.closed = "dirty"
          hold.status = "rejected"
          return ctx.fail({ code: "PRINTER_JAM", holdId: hold.holdId })
        }
        await ctx.exec({
          fn: (_ctx) => {
            record.slips.push({ holdId: hold.holdId, copyId: hold.copyId })
            hold.status = "printed"
          },
          params: [],
          name: "printer.print",
        })
      }
      return { session, printed: record.slips.length }
    } finally {
      printerLog.sessions.push(record)
    }
  },
})

export const runDispatcher = flow({
  name: "holds.ingest",
  parse: typed<void>(),
  faults: typed<Fault>(),
  deps: {
    shelf,
    stop: controller(stopping, { resolve: true }),
    drain: controller(drainPass),
  },
  factory: async (ctx, { shelf, stop, drain }) => {
    let passes = 0
    let printed = 0
    for await (const _wake of ctx.changes(holdSignal)) {
      while (shelf.holds.some((hold) => hold.status === "pending")) {
        const pass = await drain.exec()
        passes += 1
        printed += pass.printed
      }
      if (stop.get()) return { passes, printed }
    }
    return { passes, printed }
  },
})

export const requestStop = flow({
  name: "holds.stop",
  parse: typed<void>(),
  deps: {
    stop: controller(stopping, { resolve: true }),
    signal: controller(holdSignal, { resolve: true }),
  },
  factory: (_ctx, { stop, signal }) => {
    stop.update(() => true)
    signal.update((value) => value + 1)
    return { stopping: true }
  },
})

export const listHolds = flow({
  name: "holds.listPending",
  parse: typed<void>(),
  deps: { shelf },
  factory: (_ctx, { shelf }) =>
    shelf.holds.map(({ holdId, isbn, copyId, status }) => ({ holdId, isbn, copyId, status })),
})

export const printerReport = flow({
  name: "holds.report",
  parse: typed<void>(),
  deps: { printerLog },
  factory: (_ctx, { printerLog }) =>
    printerLog.sessions.map(({ session, slips, closed }) => ({
      session,
      slips: slips.map((slip) => ({ ...slip })),
      closed,
    })),
})
