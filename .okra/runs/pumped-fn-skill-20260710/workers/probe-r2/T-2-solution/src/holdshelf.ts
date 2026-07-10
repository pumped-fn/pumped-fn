import { atom, controller, flow, typed } from "@pumped-fn/lite"

type HoldStatus = "pending" | "printed" | "rejected"

export interface Hold {
  holdId: number
  isbn: string
  copyId: string
  status: HoldStatus
}

interface SessionRecord {
  session: number
  slips: Array<{ holdId: number; copyId: string }>
  closed: "clean" | "dirty"
}

interface Shelf {
  holds: Hold[]
  reports: SessionRecord[]
  nextHoldId: number
  nextSession: number
  stopping: boolean
}

type ReturnInput = { isbn: string; copyId: string }
type HoldExists = { code: "HOLD_EXISTS"; copyId: string }
type PrinterJam = { code: "PRINTER_JAM"; holdId: number; isbn: string }

const shelf = atom({
  keepAlive: true,
  factory: (): Shelf => ({
    holds: [],
    reports: [],
    nextHoldId: 1,
    nextSession: 1,
    stopping: false,
  }),
})

const wake = atom({ keepAlive: true, factory: () => 0 })

function isUnfulfilled(hold: Hold): boolean {
  return hold.status === "pending"
}

function duplicateCopy(shelfValue: Shelf, copyIds: string[]): string | undefined {
  const seen = new Set<string>()
  for (const copyId of copyIds) {
    if (seen.has(copyId) || shelfValue.holds.some((hold) => hold.copyId === copyId && isUnfulfilled(hold))) {
      return copyId
    }
    seen.add(copyId)
  }
  return undefined
}

function appendHolds(shelfValue: Shelf, returns: ReturnInput[]): { shelf: Shelf; holdIds: number[] } {
  const holdIds = returns.map((_, index) => shelfValue.nextHoldId + index)
  const holds = returns.map((entry, index) => ({
    holdId: holdIds[index]!,
    isbn: entry.isbn,
    copyId: entry.copyId,
    status: "pending" as const,
  }))
  return {
    holdIds,
    shelf: { ...shelfValue, holds: [...shelfValue.holds, ...holds], nextHoldId: shelfValue.nextHoldId + holds.length },
  }
}

export const recordReturn = flow({
  name: "record-return",
  parse: typed<ReturnInput>(),
  faults: typed<HoldExists>(),
  deps: { shelf: controller(shelf, { resolve: true }), wake: controller(wake, { resolve: true }) },
  factory: (ctx, { shelf: shelfControl, wake: wakeControl }) => {
    const shelfValue = shelfControl.get()
    const duplicate = duplicateCopy(shelfValue, [ctx.input.copyId])
    if (duplicate !== undefined) return ctx.fail({ code: "HOLD_EXISTS", copyId: duplicate })
    const committed = appendHolds(shelfValue, [ctx.input])
    shelfControl.set(committed.shelf)
    wakeControl.update((value) => value + 1)
    return { holdId: committed.holdIds[0]! }
  },
})

export const recordReturns = flow({
  name: "record-returns",
  parse: typed<{ returns: ReturnInput[] }>(),
  faults: typed<HoldExists>(),
  deps: { shelf: controller(shelf, { resolve: true }), wake: controller(wake, { resolve: true }) },
  factory: (ctx, { shelf: shelfControl, wake: wakeControl }) => {
    const shelfValue = shelfControl.get()
    const duplicate = duplicateCopy(shelfValue, ctx.input.returns.map((entry) => entry.copyId))
    if (duplicate !== undefined) return ctx.fail({ code: "HOLD_EXISTS", copyId: duplicate })
    const committed = appendHolds(shelfValue, ctx.input.returns)
    shelfControl.set(committed.shelf)
    if (committed.holdIds.length > 0) wakeControl.update((value) => value + 1)
    return { holdIds: committed.holdIds }
  },
})

export const drainPass = flow({
  name: "drain-pass",
  parse: typed<void>(),
  faults: typed<PrinterJam>(),
  deps: { shelf: controller(shelf, { resolve: true }) },
  factory: (ctx, { shelf: shelfControl }) => {
    const shelfValue = shelfControl.get()
    const session = shelfValue.nextSession
    const pending = shelfValue.holds.filter((hold) => hold.status === "pending")
    const jammed = pending.find((hold) => hold.isbn.length > 13)
    if (jammed !== undefined) {
      const holds = shelfValue.holds.map((hold) => hold.holdId === jammed.holdId ? { ...hold, status: "rejected" as const } : hold)
      shelfControl.set({
        ...shelfValue,
        holds,
        nextSession: session + 1,
        reports: [...shelfValue.reports, { session, slips: [], closed: "dirty" }],
      })
      return ctx.fail({ code: "PRINTER_JAM", holdId: jammed.holdId, isbn: jammed.isbn })
    }
    const slips = pending.map((hold) => ({ holdId: hold.holdId, copyId: hold.copyId }))
    const printed = new Set(pending.map((hold) => hold.holdId))
    const holds = shelfValue.holds.map((hold) => printed.has(hold.holdId) ? { ...hold, status: "printed" as const } : hold)
    shelfControl.set({
      ...shelfValue,
      holds,
      nextSession: session + 1,
      reports: [...shelfValue.reports, { session, slips, closed: "clean" }],
    })
    return { session, printed: slips.length }
  },
})

export const requestStop = flow({
  name: "request-stop",
  parse: typed<void>(),
  deps: { shelf: controller(shelf, { resolve: true }), wake: controller(wake, { resolve: true }) },
  factory: (_ctx, { shelf: shelfControl, wake: wakeControl }) => {
    shelfControl.update((value) => ({ ...value, stopping: true }))
    wakeControl.update((value) => value + 1)
  },
})

export const runDispatcher = flow({
  name: "run-dispatcher",
  parse: typed<void>(),
  deps: {
    shelf: controller(shelf, { resolve: true }),
    wake: controller(wake, { resolve: true }),
    drainPass: controller(drainPass),
  },
  factory: async (ctx, { shelf: shelfControl, wake: wakeControl, drainPass: drain }) => {
    let passes = 0
    let printed = 0
    for (;;) {
      while (shelfControl.get().holds.some((hold) => hold.status === "pending")) {
        passes += 1
        try {
          const result = await drain.exec()
          printed += result.printed
        } catch (error) {
          const fault = error instanceof Error && "fault" in error ? error.fault : undefined
          if (typeof fault !== "object" || fault === null || !("code" in fault) || fault.code !== "PRINTER_JAM") throw error
        }
      }
      if (shelfControl.get().stopping) return { passes, printed }
      const changes = ctx.changes(wake)
      const iterator = changes[Symbol.asyncIterator]()
      await iterator.next()
      await iterator.return?.()
    }
  },
})

export const listHolds = flow({
  name: "list-holds",
  parse: typed<void>(),
  deps: { shelf },
  factory: (_ctx, { shelf: shelfValue }) => shelfValue.holds.map((hold) => ({ ...hold })),
})

export const printerReport = flow({
  name: "printer-report",
  parse: typed<void>(),
  deps: { shelf },
  factory: (_ctx, { shelf: shelfValue }) => shelfValue.reports.map((report) => ({ ...report, slips: report.slips.map((slip) => ({ ...slip })) })),
})
