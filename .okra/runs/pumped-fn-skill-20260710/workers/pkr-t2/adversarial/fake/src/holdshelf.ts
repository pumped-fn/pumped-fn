import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"

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

const printerSession = resource({
  name: "printer-session",
  ownership: "current",
  deps: { printerLog },
  factory: (ctx, { printerLog }) => {
    const session = printerLog.nextSession
    printerLog.nextSession += 1
    let settled = false
    ctx.onClose((result) => {
      settled = result.ok
    })
    return {
      session,
      settled: () => settled,
    }
  },
})

export const recordReturn = flow({
  name: "record-return",
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
  name: "record-returns",
  parse: typed<{ returns: Return[] }>(),
  faults: typed<Fault>(),
  deps: { shelf, signal: controller(holdSignal, { resolve: true }) },
  factory: (ctx, { shelf, signal }) => {
    const staged: Hold[] = []
    for (const { isbn, copyId } of ctx.input.returns) {
      if (unfulfilled(shelf, copyId) || staged.some((hold) => hold.copyId === copyId)) {
        return ctx.fail({ code: "HOLD_EXISTS", copyId })
      }
      staged.push({
        holdId: shelf.nextHoldId + staged.length,
        isbn,
        copyId,
        status: "pending",
      })
    }
    for (const hold of staged) shelf.holds.push(hold)
    shelf.nextHoldId += staged.length
    signal.update((value) => value + 1)
    return { holdIds: staged.map((hold) => hold.holdId) }
  },
})

export const drainPass = flow({
  name: "drain-pass",
  parse: typed<void>(),
  faults: typed<Fault>(),
  deps: { shelf, printerLog, session: printerSession },
  factory: async (ctx, { shelf, printerLog, session }) => {
    const record: SessionRecord = { session: session.session, slips: [], closed: "clean" }
    printerLog.sessions.push(record)
    const batch = shelf.holds.filter((hold) => hold.status === "pending")
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
    return { session: session.session, printed: record.slips.length }
  },
})

export const runDispatcher = flow({
  name: "run-dispatcher",
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
  name: "request-stop",
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
  name: "list-holds",
  parse: typed<void>(),
  deps: { shelf },
  factory: (_ctx, { shelf }) =>
    shelf.holds.map(({ holdId, isbn, copyId, status }) => ({ holdId, isbn, copyId, status })),
})

export const printerReport = flow({
  name: "printer-report",
  parse: typed<void>(),
  deps: { printerLog },
  factory: (_ctx, { printerLog }) =>
    printerLog.sessions.map(({ session, slips, closed }) => ({
      session,
      slips: slips.map((slip) => ({ ...slip })),
      closed,
    })),
})
