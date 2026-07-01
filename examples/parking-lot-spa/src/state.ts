import { atom, controller, flow, typed } from "@pumped-fn/lite"
import * as parking from "@pumped-fn/parking-lot-shared"
import type { Role } from "@pumped-fn/parking-lot-shared"

export interface UiState {
  lotId: string
  message: string
  paymentId: string
  revenueCents: number
  role: Role
  sessionId: string
}

export const initialUi: UiState = {
  lotId: "",
  message: "Ready",
  paymentId: "",
  revenueCents: 0,
  role: "manager",
  sessionId: "",
}

export const ui = atom({
  factory: () => initialUi,
})

export const selectRole = flow({
  name: "parking-spa.select-role",
  parse: typed<Role>(),
  deps: { ui: controller(ui, { resolve: true }) },
  factory: (ctx, deps): UiState => {
    const next = { ...deps.ui.get(), role: ctx.input }
    deps.ui.set(next)
    return next
  },
})

export const configure = flow({
  name: "parking-spa.configure",
  deps: { ui: controller(ui, { resolve: true }) },
  factory: async (ctx, deps): Promise<UiState> => {
    const lot = await ctx.exec({
      flow: parking.configureLot,
      input: {
        bookingLeadMinutes: 120,
        capacity: 36,
        currency: "USD",
        graceMinutes: 10,
        name: "North Deck",
        rateCentsPerHour: 500,
        refundWindowMinutes: 1440,
      },
    })
    const next = { ...deps.ui.get(), lotId: lot.id, message: `Configured ${lot.name}` }
    deps.ui.set(next)
    return next
  },
})

export const book = flow({
  name: "parking-spa.book",
  deps: { ui: controller(ui, { resolve: true }) },
  factory: async (ctx, deps): Promise<UiState> => {
    const state = deps.ui.get()
    const booking = await ctx.exec({
      flow: parking.bookSpace,
      input: {
        endAt: "2026-07-02T12:00:00.000Z",
        lotId: state.lotId,
        plate: "SPA-101",
        startAt: "2026-07-02T09:00:00.000Z",
      },
    })
    const next = { ...state, message: `Booked ${booking.plate}` }
    deps.ui.set(next)
    return next
  },
})

export const checkIn = flow({
  name: "parking-spa.check-in",
  deps: { ui: controller(ui, { resolve: true }) },
  factory: async (ctx, deps): Promise<UiState> => {
    const state = deps.ui.get()
    const session = await ctx.exec({
      flow: parking.checkInVehicle,
      input: { lotId: state.lotId, plate: "SPA-202", userId: "user-spa" },
    })
    const next = { ...state, message: `Parked ${session.plate}`, sessionId: session.id }
    deps.ui.set(next)
    return next
  },
})

export const exit = flow({
  name: "parking-spa.exit",
  deps: { ui: controller(ui, { resolve: true }) },
  factory: async (ctx, deps): Promise<UiState> => {
    const state = deps.ui.get()
    const prepared = await ctx.exec({
      flow: parking.prepareExit,
      input: { sessionId: state.sessionId },
    })
    const next = {
      ...state,
      message: `Due ${money(prepared.payment.amountCents)}`,
      paymentId: prepared.payment.id,
    }
    deps.ui.set(next)
    return next
  },
})

export const pay = flow({
  name: "parking-spa.pay",
  deps: { ui: controller(ui, { resolve: true }) },
  factory: async (ctx, deps): Promise<UiState> => {
    const state = deps.ui.get()
    const paid = await ctx.exec({
      flow: parking.pairPayment,
      input: { externalRef: "spa-payment", method: "card", paymentId: state.paymentId },
    })
    const next = { ...state, message: `Receipt ${paid.receipt.id}` }
    deps.ui.set(next)
    return next
  },
})

export const read = flow({
  name: "parking-spa.read",
  deps: { ui: controller(ui, { resolve: true }) },
  factory: async (ctx, deps): Promise<UiState> => {
    const state = deps.ui.get()
    const report = await ctx.exec({ flow: parking.readReport, input: { lotId: state.lotId } })
    const next = { ...state, message: "Report updated", revenueCents: report.totals.revenueCents }
    deps.ui.set(next)
    return next
  },
})

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
