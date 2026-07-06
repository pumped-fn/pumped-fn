import { controller, flow, ParseError, tags } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { step } from "@pumped-fn/sdk"
import type { AuditEvent } from "./audit"
import { clock, database, intakeLines } from "./runtime"
import { importBatch } from "./triage"
import {
  enqueueInput,
  type EnqueueInput,
  type EnqueueSummary,
  type IntakeSummary,
  type Invoice,
  type StoredInvoice,
} from "./types"

export const enqueue = flow({
  name: "invoice.enqueue",
  parse: (input): EnqueueInput => enqueueInput.parse(input),
  deps: {
    database,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (ctx, { database, clock }): Promise<EnqueueSummary> => ({
    accepted: await database.enqueue(ctx.input.invoices, clock.now().toISOString()),
  }),
})

export const ingest = flow({
  name: "invoice.ingest",
  deps: {
    database,
    clock: tags.required(clock),
    importBatch: controller(importBatch),
  },
  factory: async (_ctx, { database, clock, importBatch }): Promise<void> => {
    const drain = async () => {
      const drained = await database.drainPending(clock.now().toISOString())
      if (drained.length > 0) await importBatch.exec({ input: { invoices: drained } })
    }
    await drain()
    for await (const pending of database.watchPending()) {
      if (pending.length === 0) continue
      await drain()
    }
  },
})

export const intake = flow({
  name: "invoice.intake",
  deps: {
    lines: tags.required(intakeLines),
    enqueue: controller(enqueue),
    logger: logging.logger,
  },
  factory: async (_ctx, { lines, enqueue, logger }): Promise<IntakeSummary> => {
    let accepted = 0
    let rejected = 0
    for await (const line of lines) {
      try {
        accepted += (await enqueue.exec({ rawInput: line })).accepted
      } catch (err) {
        if (!(err instanceof ParseError)) throw err
        rejected += 1
        logger.warn("invoice.intake.rejected", { line })
      }
    }
    return { accepted, rejected }
  },
})

export const listPendingInvoices = flow({
  name: "invoice.pending.list",
  deps: { database },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { database }): Promise<readonly Invoice[]> => database.listPending(),
})

export const listStoredInvoices = flow({
  name: "invoice.stored.list",
  deps: { database },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { database }): Promise<readonly StoredInvoice[]> => database.listStored(),
})

export const listAuditEvents = flow({
  name: "invoice.audit.list",
  deps: { database },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { database }): Promise<readonly AuditEvent[]> => database.listAudit(),
})

export const awaitDrained = flow({
  name: "invoice.awaitDrained",
  deps: {
    database,
  },
  factory: async (_ctx, { database }): Promise<void> => {
    if ((await database.listPending()).length === 0) return
    for await (const pending of database.watchPending()) {
      if (pending.length === 0) return
    }
  },
})
