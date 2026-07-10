import { atom, controller, flow, isFault, resource, typed } from "@pumped-fn/lite"

type Status = "pending" | "printed" | "rejected"

type Hold = {
  holdId: number
  isbn: string
  copyId: string
  status: Status
  takenBy?: number
}

type Slip = { holdId: number; copyId: string }

type SessionRecord = { session: number; slips: Slip[]; closed: "clean" | "dirty" }

type Shelf = {
  holds: Hold[]
  sessions: SessionRecord[]
  nextHoldId: number
  nextSession: number
}

type PrintSession = {
  session: number
  holds: Hold[]
  jammedHoldId?: number
}

const shelf = atom({
  factory: (): Shelf => ({ holds: [], sessions: [], nextHoldId: 1, nextSession: 1 }),
})

const signal = atom({ keepAlive: true, factory: () => 0 })

const stopping = atom({ keepAlive: true, factory: () => false })

const printingSession = resource({
  name: "printing-session",
  ownership: "current",
  deps: { shelf },
  factory: (ctx, { shelf }): PrintSession => {
    const session = shelf.nextSession
    shelf.nextSession += 1
    const holds = shelf.holds.filter((hold) => hold.status === "pending" && hold.takenBy === undefined)
    for (const hold of holds) hold.takenBy = session
    const value: PrintSession = { session, holds }
    ctx.onClose((result) => {
      if (result.ok) {
        const slips = value.holds.map(({ holdId, copyId }) => ({ holdId, copyId }))
        for (const hold of value.holds) {
          hold.status = "printed"
          hold.takenBy = undefined
        }
        shelf.sessions.push({ session, slips, closed: "clean" })
        return
      }
      for (const hold of value.holds) {
        hold.takenBy = undefined
        if (hold.holdId === value.jammedHoldId) hold.status = "rejected"
      }
      if (value.jammedHoldId !== undefined) {
        shelf.sessions.push({ session, slips: [], closed: "dirty" })
      }
    })
    return value
  },
})

function holdExists(shelf: Shelf, copyId: string): boolean {
  return shelf.holds.some((hold) => hold.copyId === copyId && hold.status === "pending")
}

function createHold(shelf: Shelf, input: { isbn: string; copyId: string }): number {
  const holdId = shelf.nextHoldId
  shelf.nextHoldId += 1
  shelf.holds.push({ holdId, ...input, status: "pending" })
  return holdId
}

export const recordReturn = flow({
  name: "record-return",
  parse: typed<{ isbn: string; copyId: string }>(),
  faults: typed<{ code: "HOLD_EXISTS"; copyId: string }>(),
  deps: { shelf, signal: controller(signal, { resolve: true }) },
  factory: (ctx, { shelf, signal }) => {
    if (holdExists(shelf, ctx.input.copyId)) {
      return ctx.fail({ code: "HOLD_EXISTS", copyId: ctx.input.copyId })
    }
    const holdId = createHold(shelf, ctx.input)
    signal.update((value) => value + 1)
    return { holdId }
  },
})

export const recordReturns = flow({
  name: "record-returns",
  parse: typed<{ returns: Array<{ isbn: string; copyId: string }> }>(),
  faults: typed<{ code: "HOLD_EXISTS"; copyId: string }>(),
  deps: { shelf, signal: controller(signal, { resolve: true }) },
  factory: (ctx, { shelf, signal }) => {
    const seen = new Set<string>()
    for (const returned of ctx.input.returns) {
      if (seen.has(returned.copyId) || holdExists(shelf, returned.copyId)) {
        return ctx.fail({ code: "HOLD_EXISTS", copyId: returned.copyId })
      }
      seen.add(returned.copyId)
    }
    const holdIds = ctx.input.returns.map((returned) => createHold(shelf, returned))
    signal.update((value) => value + 1)
    return { holdIds }
  },
})

export const drainPass = flow({
  name: "drain-pass",
  parse: typed<void>(),
  faults: typed<{ code: "PRINTER_JAM"; holdId: number }>(),
  deps: { printingSession },
  factory: (ctx, { printingSession }) => {
    for (const hold of printingSession.holds) {
      if (hold.isbn.length > 13) {
        printingSession.jammedHoldId = hold.holdId
        return ctx.fail({ code: "PRINTER_JAM", holdId: hold.holdId })
      }
    }
    return {
      session: printingSession.session,
      printed: printingSession.holds.map((hold) => hold.holdId),
    }
  },
})

function hasPending(shelf: Shelf): boolean {
  return shelf.holds.some((hold) => hold.status === "pending" && hold.takenBy === undefined)
}

export const runDispatcher = flow({
  name: "run-dispatcher",
  parse: typed<void>(),
  deps: {
    shelf,
    wake: signal,
    stop: controller(stopping, { resolve: true }),
    drainPass: controller(drainPass),
  },
  factory: async (ctx, { shelf, stop, drainPass }) => {
    let passes = 0
    let printed = 0
    const drainAvailable = async (): Promise<void> => {
      while (hasPending(shelf)) {
        passes += 1
        try {
          const result = await drainPass.exec()
          printed += result.printed.length
        } catch (error) {
          if (!isFault(drainPass.flow, error) || error.fault.code !== "PRINTER_JAM") throw error
        }
      }
    }
    await drainAvailable()
    if (stop.get()) return { passes, printed }
    for await (const _wake of ctx.changes(signal)) {
      await drainAvailable()
      if (stop.get()) {
        await drainAvailable()
        return { passes, printed }
      }
    }
    return { passes, printed }
  },
})

export const requestStop = flow({
  name: "request-stop",
  parse: typed<void>(),
  deps: {
    stopping: controller(stopping, { resolve: true }),
    signal: controller(signal, { resolve: true }),
  },
  factory: (_ctx, { stopping, signal }) => {
    stopping.set(true)
    signal.update((value) => value + 1)
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
  factory: (_ctx, { shelf }) => shelf.sessions.map(({ session, slips, closed }) => ({
    session,
    slips: slips.map((slip) => ({ ...slip })),
    closed,
  })),
})
