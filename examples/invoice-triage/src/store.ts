import { flow, tags, typed } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import { clock } from "./ports"
import { txBoundary } from "./unit"
import {
  enqueueInput,
  type AuditEvent,
  type EnqueueInput,
  type EnqueueSummary,
  type Invoice,
  type SaveInvoiceInput,
  type StoredInvoice,
} from "./types"

export const enqueueRows = flow({
  name: "invoice.enqueue",
  parse: (input): EnqueueInput => enqueueInput.parse(input),
  deps: {
    store: txBoundary,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (ctx, { store, clock }): Promise<EnqueueSummary> => {
    const ids = await store.enqueuePending.exec({ params: [ctx.input.invoices, clock] })
    return { accepted: ids.length }
  },
})

export const settleInvoice = flow({
  name: "invoice.save",
  parse: typed<SaveInvoiceInput>(),
  deps: {
    store: txBoundary,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { store, clock }): Promise<StoredInvoice> => store.settleImport.exec({ params: [ctx.input, clock.now()] }),
})

export const readStored = flow({
  name: "invoice.listStored",
  deps: {
    store: txBoundary,
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { store }): Promise<readonly StoredInvoice[]> => store.listStored.exec(),
})

export const readPending = flow({
  name: "invoice.listPending",
  deps: {
    store: txBoundary,
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { store }): Promise<readonly Invoice[]> => store.listPending.exec(),
})

export const countReviews = flow({
  name: "invoice.reviewCount",
  deps: {
    store: txBoundary,
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { store }): Promise<number> => store.reviewCount.exec(),
})

export const readAudit = flow({
  name: "invoice.listAudit",
  deps: {
    store: txBoundary,
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { store }): Promise<readonly AuditEvent[]> => store.listAudit.exec(),
})

export const claimReminder = flow({
  name: "invoice.markReminderSent",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    store: txBoundary,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { store, clock }): Promise<StoredInvoice | undefined> => store.claimReminder.exec({ params: [ctx.input.invoiceId, clock.now()] }),
})

export const releaseReminderClaim = flow({
  name: "invoice.releaseReminder",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    store: txBoundary,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { store, clock }): Promise<void> => store.releaseReminder.exec({ params: [ctx.input.invoiceId, clock.now()] }),
})
