import { atom, controller, createScope, flow, isStreamingExec, ParseError, preset, typed, type Lite } from "@pumped-fn/lite"
import { logging, type Logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel, type Otel } from "@pumped-fn/lite-extension-observable-otel"
import { scheduler, type Scheduler } from "@pumped-fn/lite-extension-scheduler"
import { inspect, model as provider, workflowRun, type Model } from "@pumped-fn/sdk"
import { kit, modelStub } from "@pumped-fn/sdk-test"
import { describe, expect, expectTypeOf, it } from "vitest"
import { database } from "../src/database"
import {
  awaitDrained,
  dailyReport,
  dailyReportJob,
  enqueue,
  ingest,
  importBatch,
  intake,
  listAudit,
  listPending,
  listStored,
  markReminderSent,
  reviewCount,
  saveInvoice,
  sendReminders,
  sendRemindersJob,
  stop,
  triage,
  watchReviewQueue,
} from "../src/flows"
import {
  clock,
  heuristic,
  intakeLines,
  outstanding,
  queueSignal,
  reminderRecipient,
  reminderWindowDays,
  storedSignal,
} from "../src/ports"
import { notifier, type Notifier } from "../src/notifier"
import {
  type Category,
  type Classification,
  type ImportProgress,
  type ImportSummary,
  type Invoice,
  type ReminderMessage,
  type ReminderResult,
  type Risk,
  type StoredInvoice,
} from "../src/types"
import { pgliteDatabase } from "./support/database"

const now = new Date("2026-07-05T12:00:00.000Z")

function invoice(id: string, options: Partial<Invoice> = {}): Invoice {
  return {
    id,
    vendor: "Acme SaaS",
    amount: 240,
    dueDate: "2026-07-08",
    description: "team subscription license",
    ...options,
  }
}

function classification(options: Partial<Classification> = {}): Classification {
  return {
    vendor: "Acme SaaS",
    amount: 240,
    dueDate: "2026-07-08",
    category: "saas",
    risk: "auto-approve",
    reason: "scripted",
    ...options,
  }
}

function json(options: Partial<Classification> = {}): string {
  return JSON.stringify(classification(options))
}

function scripted(outputs: readonly string[]): Model {
  let index = 0
  return modelStub(() => ({
    content: outputs[index++] ?? outputs.at(-1) ?? json(),
    stop: true,
  }))
}

function gated(outputs: readonly string[]) {
  let calls = 0
  let startFirst = () => {}
  let releaseFirst = () => {}
  const firstStarted = new Promise<void>((resolve) => {
    startFirst = resolve
  })
  const firstReleased = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  return {
    model: modelStub(async () => {
      const index = calls
      calls += 1
      if (index === 0) {
        startFirst()
        await firstReleased
      }
      return {
        content: outputs[index] ?? outputs.at(-1) ?? json(),
        stop: true,
      }
    }),
    firstStarted,
    releaseFirst,
    calls: () => calls,
  }
}

function stored(
  id: string,
  dueDate: string,
  category: Category,
  risk: Risk,
  remindedAt?: string
): StoredInvoice {
  const source = invoice(id, { dueDate, vendor: `${id} vendor`, amount: risk === "review" ? 2_400 : 240 })
  return {
    ...source,
    classification: classification({
      vendor: source.vendor,
      amount: source.amount,
      dueDate,
      category,
      risk,
    }),
    importedAt: "2026-07-01T00:00:00.000Z",
    remindedAt,
  }
}

const seedStored = flow({
  name: "test.seedStored",
  parse: typed<readonly StoredInvoice[]>(),
  deps: {
    saveInvoice: controller(saveInvoice),
    markReminderSent: controller(markReminderSent),
  },
  factory: async (ctx, { saveInvoice, markReminderSent }): Promise<void> => {
    for (const item of ctx.input) {
      await saveInvoice.exec({
        input: {
          invoice: {
            id: item.id,
            vendor: item.vendor,
            amount: item.amount,
            dueDate: item.dueDate,
            description: item.description,
          },
          classification: item.classification,
        },
      })
      if (item.remindedAt !== undefined) await markReminderSent.exec({ input: { invoiceId: item.id } })
    }
  },
})

interface CollectingNotifier extends Notifier {
  record(message: ReminderMessage): Promise<ReminderResult>
}

function collecting(messages: ReminderMessage[]): Notifier {
  const client: CollectingNotifier = {
    async send(message: ReminderMessage): Promise<ReminderResult> {
      return this.record(message)
    },
    async record(message: ReminderMessage): Promise<ReminderResult> {
      messages.push(message)
      return { invoiceId: message.invoiceId, sent: true }
    },
  }
  return client
}

interface Feed<T> extends AsyncIterable<T>, AsyncIterator<T, undefined> {
  push(value: T): void
  close(): void
  return(): Promise<IteratorReturnResult<undefined>>
}

function feed<T>(): Feed<T> {
  const values: IteratorYieldResult<T>[] = []
  let pending: ((result: IteratorResult<T, undefined>) => void) | undefined
  let closed = false
  const stream: Feed<T> = {
    next(): Promise<IteratorResult<T, undefined>> {
      const value = values.shift()
      if (value !== undefined) return Promise.resolve(value)
      if (closed) return Promise.resolve({ done: true, value: undefined })
      return new Promise((resolve) => {
        pending = resolve
      })
    },
    push(value: T): void {
      if (closed) throw new Error("Feed is closed")
      if (pending === undefined) {
        values.push({ done: false, value })
        return
      }
      const resolve = pending
      pending = undefined
      resolve({ done: false, value })
    },
    close(): void {
      closed = true
      const resolve = pending
      pending = undefined
      resolve?.({ done: true, value: undefined })
    },
    return(): Promise<IteratorReturnResult<undefined>> {
      stream.close()
      return Promise.resolve({ done: true, value: undefined })
    },
    [Symbol.asyncIterator](): AsyncIterator<T, undefined> {
      return stream
    },
  }
  return stream
}

function recordingSink() {
  let waiters: { count: number; resolve(): void }[] = []
  const checks: (() => void)[] = []
  const records: Logging.Record[] = []
  const sink: Logging.Sink = {
    name: "recording",
    write(record) {
      records.push(record)
      const ready = waiters.filter((waiter) => records.length >= waiter.count)
      waiters = waiters.filter((waiter) => records.length < waiter.count)
      for (const waiter of ready) waiter.resolve()
      for (const probe of [...checks]) probe()
    },
  }
  return {
    sink,
    records: () => records.slice(),
    waitFor(count: number): Promise<void> {
      if (records.length >= count) return Promise.resolve()
      return new Promise((resolve) => {
        waiters.push({ count, resolve })
      })
    },
    waitUntil(matches: (records: readonly Logging.Record[]) => boolean): Promise<void> {
      if (matches(records)) return Promise.resolve()
      return new Promise((resolve) => {
        const probe = () => {
          if (!matches(records)) return
          checks.splice(checks.indexOf(probe), 1)
          resolve()
        }
        checks.push(probe)
      })
    },
  }
}

interface RecordedSpan {
  readonly name: string
  ended: boolean
}

function recordingTracer() {
  const spans: RecordedSpan[] = []
  const tracer: Otel.Tracer = {
    startSpan(name) {
      const record: RecordedSpan = { name, ended: false }
      const span: Otel.Span = {
        setAttributes: () => span,
        setStatus: () => span,
        recordException: () => {},
        end: () => {
          record.ended = true
        },
      }
      spans.push(record)
      return span
    },
  }
  return {
    tracer,
    names: () => [...new Set(spans.filter((span) => span.ended).map((span) => span.name))].sort(),
  }
}

class ManualRegistration implements Scheduler.Registration {
  private stopped = false

  constructor(
    readonly spec: Parameters<Scheduler.Backend["register"]>[0],
    private readonly tick: Parameters<Scheduler.Backend["register"]>[1]
  ) {}

  async trigger(dedupKey = "manual"): Promise<void> {
    if (this.stopped) throw new Error("Registration stopped")
    await this.tick({ key: `${this.spec.name}:${dedupKey}`, scheduledAt: now })
  }

  next(): Date | undefined {
    return undefined
  }

  async stop(): Promise<void> {
    this.stopped = true
  }
}

class ManualBackend implements Scheduler.Backend {
  readonly registrations: ManualRegistration[] = []

  register(
    spec: Parameters<Scheduler.Backend["register"]>[0],
    tick: Parameters<Scheduler.Backend["register"]>[1]
  ): Scheduler.Registration {
    const registration = new ManualRegistration(spec, tick)
    this.registrations.push(registration)
    return registration
  }
}

class ReminderDeliveryFailure extends Error {
  readonly kind = "reminder_delivery_failed"
  readonly op = "deliver"
  readonly entity = "invoice"
}

describe("invoice triage patterns", () => {
  it("pattern: execStream consumption shows progress, interleaved triage steps, and .result summary", async () => {
    const first = invoice("inv-stream-1")
    const second = invoice("inv-stream-2", { vendor: "Contoso Hardware", amount: 4_500, description: "server hardware" })
    const runtime = kit()
    const scope = createScope({
      extensions: runtime.extensions,
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        provider(scripted([
          json({ vendor: first.vendor, amount: first.amount, dueDate: first.dueDate }),
          json({
            vendor: second.vendor,
            amount: second.amount,
            dueDate: second.dueDate,
            category: "hardware",
            risk: "review",
            reason: "hardware purchase",
          }),
        ])),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "stream", runId: "run-1" })] })
    const stream = ctx.execStream({ flow: importBatch, input: { invoices: [first, second] } })
    const progress: ImportProgress[] = []

    expectTypeOf(stream).toEqualTypeOf<Lite.FlowStream<ImportProgress, ImportSummary>>()
    for await (const item of stream) progress.push(item)
    expectTypeOf(stream.result).toEqualTypeOf<Promise<ImportSummary>>()
    await expect(stream.result).resolves.toEqual({ imported: 2, review: ["inv-stream-2"] })
    expect(progress).toEqual([
      { invoiceId: "inv-stream-1", step: "model:request" },
      { invoiceId: "inv-stream-1", step: "model:classification", risk: "auto-approve", reason: "scripted" },
      { invoiceId: "inv-stream-1", done: 1, total: 2, risk: "auto-approve" },
      { invoiceId: "inv-stream-2", step: "model:request" },
      { invoiceId: "inv-stream-2", step: "model:classification", risk: "review", reason: "hardware purchase" },
      { invoiceId: "inv-stream-2", done: 2, total: 2, risk: "review" },
    ])
    const run = await inspect(runtime.log, { taskId: "stream", runId: "run-1" })
    expect(run.steps.map((step) => step.targetName)).toEqual([
      "model.stub",
      "model.complete",
      "invoice.save",
      "model.stub",
      "model.complete",
      "invoice.save",
    ])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: exec consumption drains generator progress and returns summary only", async () => {
    const runtime = kit()
    const scope = createScope({
      extensions: runtime.extensions,
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        provider(scripted([
          json({ risk: "review", reason: "manual approval" }),
          json(),
        ])),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "exec", runId: "run-1" })] })

    await expect(ctx.exec({
      flow: importBatch,
      input: { invoices: [invoice("inv-exec-1"), invoice("inv-exec-2")] },
    })).resolves.toEqual({ imported: 2, review: ["inv-exec-1"] })
    expect((await ctx.exec({ flow: listStored })).map((item) => item.id)).toEqual(["inv-exec-1", "inv-exec-2"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: abandonment aborts a streaming batch after the completed invoice commits", async () => {
    const closes: Lite.CloseResult[] = []
    const streaming: boolean[] = []
    const first = invoice("inv-abandon-1")
    const second = invoice("inv-abandon-2")
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      extensions: [
        {
          name: "close-recorder",
          wrapExec: async (next, target, ctx) => {
            if (target === importBatch) {
              streaming.push(isStreamingExec(target, ctx))
              ctx.onClose((result) => {
                closes.push(result)
              })
            }
            return next()
          },
        },
      ],
      tags: [
        provider(scripted([
          json({ vendor: first.vendor, amount: first.amount, dueDate: first.dueDate }),
          json({ vendor: second.vendor, amount: second.amount, dueDate: second.dueDate }),
        ])),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: importBatch, input: { invoices: [first, second] } })
    const seen: ImportProgress[] = []

    for await (const item of stream) {
      seen.push(item)
      if ("done" in item) break
    }

    await expect(stream.result).rejects.toThrow("Flow stream aborted")
    expect(streaming).toEqual([true])
    expect(seen.at(-1)).toEqual({ invoiceId: "inv-abandon-1", done: 1, total: 2, risk: "auto-approve" })
    expect((await ctx.exec({ flow: listStored })).map((item) => item.id)).toEqual(["inv-abandon-1"])
    expect((await ctx.exec({ flow: listAudit })).map((item) => item.action)).toEqual(["imported"])
    expect(closes[0]).toMatchObject({ ok: false, aborted: true })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: malformed model output becomes review classification without crashing", async () => {
    const runtime = kit()
    const scope = createScope({
      extensions: runtime.extensions,
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        provider(scripted(["not json"])),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: triage, input: invoice("inv-malformed") })).resolves.toMatchObject({
      risk: "review",
      reason: "unparseable",
      category: "other",
    })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: resolveStream feed fans out to two consumers and drain collects a fresh view", async () => {
    interface Heartbeat {
      source: string
      checkedAt: string
    }
    const heartbeat = atom({
      keepAlive: true,
      factory: (ctx): Feed<Heartbeat> => {
        const stream = feed<Heartbeat>()
        ctx.cleanup(() => stream.close())
        return stream
      },
    })
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
    })
    const stream = await scope.resolve(heartbeat)
    const left = scope.resolveStream(heartbeat)[Symbol.asyncIterator]()
    const right = scope.resolveStream(heartbeat)[Symbol.asyncIterator]()
    const drained = scope.drain(heartbeat, { take: 2 })
    const first = { source: "ops", checkedAt: "2026-07-05T12:00:00.000Z" }
    const second = { source: "ops", checkedAt: "2026-07-05T12:01:00.000Z" }
    const leftFirst = left.next()
    const rightFirst = right.next()

    stream.push(first)
    expect(await leftFirst).toEqual({ done: false, value: first })
    expect(await rightFirst).toEqual({ done: false, value: first })

    const leftSecond = left.next()
    const rightSecond = right.next()
    stream.push(second)
    expect(await leftSecond).toEqual({ done: false, value: second })
    expect(await rightSecond).toEqual({ done: false, value: second })
    await expect(drained).resolves.toEqual([first, second])
    await scope.dispose()
  })

  it("burst-no-loss: enqueue bursts drain from state without dropping invoices", async () => {
    const first = [invoice("inv-burst-1"), invoice("inv-burst-2")]
    const second = [invoice("inv-burst-3")]
    const third = [invoice("inv-burst-4"), invoice("inv-burst-5")]
    const all = [...first, ...second, ...third]
    const gate = gated(all.map((item) => json({
      vendor: item.vendor,
      amount: item.amount,
      dueDate: item.dueDate,
    })))
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        provider(gate.model),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()
    const processing = ctx.exec({ flow: ingest })

    await ctx.exec({ flow: enqueue, input: { invoices: first } })
    await gate.firstStarted
    const pendingEnqueues = Promise.all([
      ctx.exec({ flow: enqueue, input: { invoices: second } }),
      ctx.exec({ flow: enqueue, input: { invoices: third } }),
    ])
    gate.releaseFirst()
    await pendingEnqueues

    await ctx.exec({ flow: awaitDrained })
    expect((await ctx.exec({ flow: listStored })).map((item) => item.id).sort()).toEqual(all.map((item) => item.id).sort())
    expect(await ctx.exec({ flow: listPending })).toEqual([])
    expect(gate.calls()).toBe(all.length)
    await ctx.exec({ flow: stop })
    const [ingestOutcome] = await Promise.allSettled([processing])
    expect(ingestOutcome.status).toBe("fulfilled")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("drain-race: enqueue interleaved after wakeup is drained without loss", async () => {
    const first = [invoice("inv-race-wakeup")]
    const second = [invoice("inv-race-mid-cycle")]
    const all = [...first, ...second]
    const gate = gated(all.map((item) => json({
      vendor: item.vendor,
      amount: item.amount,
      dueDate: item.dueDate,
    })))
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        provider(gate.model),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()
    const changes = scope.changes(queueSignal)[Symbol.asyncIterator]()
    const interleave = (async () => {
      for (;;) {
        const next = await changes.next()
        if (next.done) return
        if (next.value > 0) {
          await ctx.exec({ flow: enqueue, input: { invoices: second } })
          await changes.return?.()
          return
        }
      }
    })()
    const processing = ctx.exec({ flow: ingest })

    await ctx.exec({ flow: enqueue, input: { invoices: first } })
    await interleave
    await gate.firstStarted
    gate.releaseFirst()

    await ctx.exec({ flow: awaitDrained })
    expect((await ctx.exec({ flow: listStored })).map((item) => item.id).sort()).toEqual(all.map((item) => item.id).sort())
    expect(await ctx.exec({ flow: listPending })).toEqual([])
    expect(gate.calls()).toBe(all.length)
    await ctx.exec({ flow: stop })
    const [ingestOutcome] = await Promise.allSettled([processing])
    expect(ingestOutcome.status).toBe("fulfilled")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("shutdown: awaitDrained resolves only after the in-flight batch lands", async () => {
    const batch = [invoice("inv-shutdown-1"), invoice("inv-shutdown-2")]
    const gate = gated(batch.map((item) => json({
      vendor: item.vendor,
      amount: item.amount,
      dueDate: item.dueDate,
    })))
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        provider(gate.model),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()
    const processing = ctx.exec({ flow: ingest })

    await ctx.exec({ flow: enqueue, input: { invoices: batch } })
    await gate.firstStarted

    let settled = false
    const waiting = ctx.exec({ flow: awaitDrained }).then(() => {
      settled = true
    })
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(settled).toBe(false)

    gate.releaseFirst()
    await waiting
    expect((await ctx.exec({ flow: listStored })).map((item) => item.id)).toEqual(batch.map((item) => item.id))
    expect(gate.calls()).toBe(batch.length)
    await ctx.exec({ flow: stop })
    const [ingestOutcome] = await Promise.allSettled([processing])
    expect(ingestOutcome.status).toBe("fulfilled")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("shutdown: a failed import surfaces through ingest and never wedges awaitDrained", async () => {
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        provider(modelStub(() => {
          throw new Error("provider down")
        })),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()
    const processing = ctx.exec({ flow: ingest })

    await ctx.exec({ flow: enqueue, input: { invoices: [invoice("inv-fail-1")] } })
    await ctx.exec({ flow: awaitDrained })
    expect(await ctx.exec({ flow: listStored })).toEqual([])
    expect((await ctx.exec({ flow: listPending })).map((item) => item.id)).toEqual(["inv-fail-1"])
    await ctx.exec({ flow: stop })
    const [ingestOutcome] = await Promise.allSettled([processing])
    expect(ingestOutcome.status).toBe("rejected")
    if (ingestOutcome.status !== "rejected") throw new Error("ingest did not reject")
    expect(ingestOutcome.reason).toEqual(expect.any(Error))
    expect((ingestOutcome.reason as Error).message).toBe("provider down")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("killed-after-drain recovery: settled invoices persist and the failed one remains pending", async () => {
    const db = await pgliteDatabase()
    const first = invoice("inv-kill-a")
    const second = invoice("inv-kill-b", { vendor: "Contoso Hardware", amount: 4_500 })
    let calls = 0
    const failing = createScope({
      presets: [preset(database, db)],
      tags: [
        provider(modelStub(() => {
          calls += 1
          if (calls === 1) {
            return {
              content: json({ vendor: first.vendor, amount: first.amount, dueDate: first.dueDate }),
              stop: true,
            }
          }
          throw new Error("provider down")
        })),
        clock({ now: () => now }),
      ],
    })
    const failingCtx = failing.createContext()
    const processing = failingCtx.exec({ flow: ingest })

    await failingCtx.exec({ flow: enqueue, input: { invoices: [first, second] } })
    await expect(processing).rejects.toThrow("provider down")
    expect(calls).toBe(2)
    expect((await failingCtx.exec({ flow: listStored })).map((item) => item.id)).toEqual([first.id])
    expect((await failingCtx.exec({ flow: listPending })).map((item) => item.id)).toEqual([second.id])
    expect(await failingCtx.exec({ flow: reviewCount })).toBe(0)
    expect((await failingCtx.exec({ flow: listAudit })).map((item) => item.action)).toEqual(["enqueued", "imported"])
    await failingCtx.close({ ok: true })
    await failing.dispose()

    const gate = gated([json({
      vendor: first.vendor,
      amount: first.amount,
      dueDate: first.dueDate,
    }), json({
      vendor: second.vendor,
      amount: second.amount,
      dueDate: second.dueDate,
      category: "hardware",
    })])
    const recovered = createScope({
      presets: [preset(database, db)],
      tags: [
        provider(gate.model),
        clock({ now: () => now }),
      ],
    })
    const recoveredCtx = recovered.createContext()
    const recoveredProcessing = recoveredCtx.exec({ flow: ingest })

    await gate.firstStarted
    gate.releaseFirst()
    await recoveredCtx.exec({ flow: awaitDrained })
    expect((await recoveredCtx.exec({ flow: listStored })).map((item) => item.id)).toEqual([first.id, second.id])
    expect(await recoveredCtx.exec({ flow: listPending })).toEqual([])
    expect((await recoveredCtx.exec({ flow: listAudit })).map((item) => item.action)).toEqual(["enqueued", "imported", "imported"])
    await recoveredCtx.exec({ flow: stop })
    const [ingestOutcome] = await Promise.allSettled([recoveredProcessing])
    expect(ingestOutcome.status).toBe("fulfilled")
    await recoveredCtx.close({ ok: true })
    await recovered.dispose()
  })

  it("crash-recovery: pending rows from a prior scope import in the next scope", async () => {
    const db = await pgliteDatabase()
    const batch = [invoice("inv-recover-1"), invoice("inv-recover-2", { vendor: "Contoso Hardware", amount: 4_500 })]
    const first = createScope({
      presets: [preset(database, db)],
      tags: [clock({ now: () => now })],
    })
    const firstCtx = first.createContext()

    await expect(firstCtx.exec({ flow: enqueue, input: { invoices: batch } })).resolves.toEqual({ accepted: 2 })
    expect((await firstCtx.exec({ flow: listPending })).map((item) => item.id)).toEqual(batch.map((item) => item.id))
    await firstCtx.close({ ok: true })
    await first.dispose()

    const gate = gated(batch.map((item) => json({
      vendor: item.vendor,
      amount: item.amount,
      dueDate: item.dueDate,
    })))
    const second = createScope({
      presets: [preset(database, db)],
      tags: [
        provider(gate.model),
        clock({ now: () => now }),
      ],
    })
    const secondCtx = second.createContext()
    const processing = secondCtx.exec({ flow: ingest })

    await gate.firstStarted
    gate.releaseFirst()
    await secondCtx.exec({ flow: awaitDrained })

    await secondCtx.exec({ flow: stop })
    const [ingestOutcome] = await Promise.allSettled([processing])
    expect(ingestOutcome.status).toBe("fulfilled")
    expect((await secondCtx.exec({ flow: listStored })).map((item) => item.id)).toEqual(batch.map((item) => item.id))
    expect(await secondCtx.exec({ flow: listPending })).toEqual([])
    await secondCtx.close({ ok: true })
    await second.dispose()
  })

  it("aggregate-atomicity: enqueue rolls back pending rows when audit timestamp fails", async () => {
    const db = await pgliteDatabase()
    let calls = 0
    const failingClock = {
      now(): Date {
        calls += 1
        if (calls === 2) throw new Error("clock failed")
        return now
      },
    }
    const first = createScope({
      presets: [preset(database, db)],
      tags: [clock(failingClock)],
    })
    const firstCtx = first.createContext()

    await expect(firstCtx.exec({ flow: enqueue, input: { invoices: [invoice("inv-atomic-1")] } })).rejects.toThrow("clock failed")
    expect(calls).toBe(2)
    expect(await firstCtx.exec({ flow: listPending })).toEqual([])
    expect(await firstCtx.exec({ flow: listAudit })).toEqual([])
    await firstCtx.close({ ok: true })
    await first.dispose()

    const second = createScope({
      presets: [preset(database, db)],
      tags: [clock({ now: () => now })],
    })
    const secondCtx = second.createContext()

    await expect(secondCtx.exec({ flow: enqueue, input: { invoices: [invoice("inv-atomic-2")] } })).resolves.toEqual({ accepted: 1 })
    expect((await secondCtx.exec({ flow: listPending })).map((item) => item.id)).toEqual(["inv-atomic-2"])
    expect((await secondCtx.exec({ flow: listAudit })).map((item) => item.action)).toEqual(["enqueued"])
    await secondCtx.close({ ok: true })
    await second.dispose()
  })

  it("commit-failure: close does not lie and signals stay silent", async () => {
    const db = await pgliteDatabase()
    let armed = true
    const failing = new Proxy(db as object, {
      get(target, property) {
        const member = Reflect.get(target, property)
        if (property === "transaction" && armed) {
          return (run: (tx: unknown) => Promise<unknown>, options?: unknown) => {
            armed = false
            return (target as { transaction(run: (tx: unknown) => Promise<unknown>, options?: unknown): Promise<unknown> })
              .transaction(async (conn) => {
                await run(conn)
                throw new Error("commit failed")
              }, options)
          }
        }
        return typeof member === "function" ? member.bind(target) : member
      },
    }) as typeof db
    const scope = createScope({
      presets: [preset(database, failing)],
      tags: [provider(scripted([json()])), clock({ now: () => now })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: enqueue, input: { invoices: [invoice("inv-commit-fail")] } })).rejects.toThrow("commit failed")
    expect(await scope.resolve(queueSignal)).toBe(0)
    expect(await scope.resolve(outstanding)).toBe(0)
    expect(await ctx.exec({ flow: listPending })).toEqual([])

    await expect(ctx.exec({ flow: enqueue, input: { invoices: [invoice("inv-commit-ok")] } })).resolves.toEqual({ accepted: 1 })
    expect(await scope.resolve(queueSignal)).toBe(1)
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("wake-after-commit: queueSignal fires only after pending row is visible", async () => {
    const item = invoice("inv-wake-after-commit")
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      tags: [clock({ now: () => now })],
    })
    const ctx = scope.createContext()
    const changes = scope.changes(queueSignal)[Symbol.asyncIterator]()
    const observed = (async (): Promise<readonly Invoice[]> => {
      for (;;) {
        const next = await changes.next()
        if (next.done) return []
        if (next.value === 0) continue
        const read = scope.createContext()
        const pending = await read.exec({ flow: listPending })
        await read.close({ ok: true })
        return pending
      }
    })()

    await ctx.exec({ flow: enqueue, input: { invoices: [item] } })

    await expect(observed).resolves.toEqual([item])
    await changes.return?.()
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: changes ops view conflates review-count observations during import", async () => {
    const runtime = kit()
    const recorder = recordingSink()
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      extensions: [logging.extension(), ...runtime.extensions],
      tags: [
        logging.runtime({
          sinks: [recorder.sink],
          level: "info",
          flow: "errors",
        }),
        provider(scripted([
          json({ risk: "review", reason: "needs approval" }),
          json({ risk: "review", reason: "needs approval" }),
          json({ risk: "review", reason: "needs approval" }),
        ])),
        clock({ now: () => now }),
      ],
    })
    const log = scope.createContext()
    const watching = log.exec({ flow: watchReviewQueue })
    await recorder.waitFor(1)
    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "changes", runId: "run-1" })] })

    await ctx.exec({
      flow: importBatch,
      input: { invoices: [invoice("inv-change-1"), invoice("inv-change-2"), invoice("inv-change-3")] },
    })
    scope.controller(storedSignal).update((value) => value + 1)
    await recorder.waitUntil((records) => records.at(-1)?.fields?.["count"] === 3)
    const counts = recorder.records().map((record) => record.fields?.["count"] as number)
    expect(counts[0]).toBe(0)
    expect(counts.at(-1)).toBe(3)
    expect(counts).toEqual([...new Set(counts)].sort((left, right) => left - right))
    await log.exec({ flow: stop })
    const [watchOutcome] = await Promise.allSettled([watching])
    expect(watchOutcome.status).toBe("fulfilled")
    await ctx.close({ ok: true })
    await log.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: reminders are idempotent and include both reminder-window boundaries", async () => {
    const messages: ReminderMessage[] = []
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        notifier(collecting(messages)),
        clock({ now: () => now }),
        reminderRecipient("ap-test@company.local"),
        reminderWindowDays(3),
      ],
    })
    const ctx = scope.createContext()
    await ctx.exec({ flow: seedStored, input: [
      stored("inv-remind-today", "2026-07-05", "utilities", "auto-approve"),
      stored("inv-remind-horizon", "2026-07-08", "saas", "auto-approve"),
      stored("inv-remind-beyond", "2026-07-09", "saas", "auto-approve"),
      stored("inv-remind-done", "2026-07-06", "hardware", "review", "2026-07-04T00:00:00.000Z"),
    ] })

    await expect(ctx.exec({ flow: sendReminders })).resolves.toEqual({
      sent: 2,
      invoiceIds: ["inv-remind-horizon", "inv-remind-today"],
    })
    expect(messages.map((message) => message.invoiceId)).toEqual(["inv-remind-horizon", "inv-remind-today"])
    expect(messages.map((message) => message.to)).toEqual(["ap-test@company.local", "ap-test@company.local"])
    await expect(ctx.exec({ flow: sendReminders })).resolves.toEqual({ sent: 0, invoiceIds: [] })
    expect(messages).toHaveLength(2)
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("concurrent-settle: a second worker settling the same invoice cannot overwrite or double-audit", async () => {
    const db = await pgliteDatabase()
    const winner = createScope({ presets: [preset(database, db)], tags: [clock({ now: () => now })] })
    const loser = createScope({ presets: [preset(database, db)], tags: [clock({ now: () => now })] })
    const winnerCtx = winner.createContext()
    const loserCtx = loser.createContext()
    const item = invoice("inv-race-settle")

    await winnerCtx.exec({ flow: enqueue, input: { invoices: [item] } })
    const first = await winnerCtx.exec({ flow: saveInvoice, input: { invoice: item, classification: classification({ risk: "auto-approve", reason: "winner" }) } })
    const second = await loserCtx.exec({ flow: saveInvoice, input: { invoice: item, classification: classification({ risk: "review", reason: "loser" }) } })

    expect(first.classification.reason).toBe("winner")
    expect(second.classification.reason).toBe("winner")
    expect((await winnerCtx.exec({ flow: listStored })).map((row) => row.classification.reason)).toEqual(["winner"])
    expect((await winnerCtx.exec({ flow: listAudit })).filter((event) => event.action === "imported")).toHaveLength(1)
    await winnerCtx.close({ ok: true })
    await loserCtx.close({ ok: true })
    await winner.dispose()
    await loser.dispose()
  })

  it("reminder-retry: failed delivery releases the claim for a later run", async () => {
    const db = await pgliteDatabase()
    const messages: ReminderMessage[] = []
    let attempts = 0
    const failing: Notifier = {
      async send(message: ReminderMessage): Promise<ReminderResult> {
        attempts += 1
        messages.push(message)
        throw new ReminderDeliveryFailure("smtp down")
      },
    }
    const first = createScope({
      presets: [preset(database, db)],
      tags: [
        notifier(failing),
        clock({ now: () => now }),
        reminderRecipient("ap-test@company.local"),
        reminderWindowDays(3),
      ],
    })
    const firstCtx = first.createContext()
    await firstCtx.exec({ flow: seedStored, input: [stored("inv-remind-retry", "2026-07-06", "saas", "auto-approve")] })

    await expect(firstCtx.exec({ flow: sendReminders })).rejects.toThrow("smtp down")
    expect(attempts).toBe(1)
    expect(messages.map((message) => message.invoiceId)).toEqual(["inv-remind-retry"])
    expect((await firstCtx.exec({ flow: listStored }))[0]?.remindedAt).toBeUndefined()
    expect((await firstCtx.exec({ flow: listAudit }))
      .filter((item) => item.action === "reminded" || item.action === "reminder_failed")
      .map((item) => item.action)).toEqual(["reminded", "reminder_failed"])
    await firstCtx.close({ ok: true })
    await first.dispose()

    const second = createScope({
      presets: [preset(database, db)],
      tags: [
        notifier(collecting(messages)),
        clock({ now: () => now }),
        reminderRecipient("ap-test@company.local"),
        reminderWindowDays(3),
      ],
    })
    const secondCtx = second.createContext()
    await expect(secondCtx.exec({ flow: sendReminders })).resolves.toEqual({
      sent: 1,
      invoiceIds: ["inv-remind-retry"],
    })
    expect(messages.map((message) => message.invoiceId)).toEqual(["inv-remind-retry", "inv-remind-retry"])
    expect((await secondCtx.exec({ flow: listAudit }))
      .filter((item) => item.action === "reminded" || item.action === "reminder_failed")
      .map((item) => item.action)).toEqual(["reminded", "reminder_failed", "reminded"])
    await secondCtx.close({ ok: true })
    await second.dispose()
  })

  it("pattern: dailyReport summarizes totals, categories, and overdue invoices", async () => {
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      tags: [clock({ now: () => now })],
    })
    const ctx = scope.createContext()
    await ctx.exec({ flow: seedStored, input: [
      stored("inv-report-overdue", "2026-07-04", "utilities", "auto-approve"),
      stored("inv-report-today", "2026-07-05", "saas", "auto-approve"),
      stored("inv-report-review", "2026-07-10", "hardware", "review"),
    ] })

    await expect(ctx.exec({ flow: dailyReport })).resolves.toEqual({
      total: 3,
      byCategory: {
        utilities: 1,
        saas: 1,
        hardware: 1,
        other: 0,
      },
      overdue: ["inv-report-overdue"],
    })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: cron registration uses deterministic manual ticks without sleeps", async () => {
    const backend = new ManualBackend()
    const messages: ReminderMessage[] = []
    const scope = createScope({
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        notifier(collecting(messages)),
        scheduler.backend(backend),
        reminderWindowDays(5),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()
    await ctx.exec({ flow: seedStored, input: [stored("inv-cron-reminder", "2026-07-06", "saas", "auto-approve")] })

    await ctx.resolve(dailyReportJob)
    await ctx.resolve(sendRemindersJob)
    expect(backend.registrations.map((registration) => registration.spec)).toMatchObject([
      { name: "invoice.dailyReport", cadence: { cron: "0 8 * * *" }, overlap: "skip", catchUp: "skip" },
      { name: "invoice.sendReminders", cadence: { cron: "0 9 * * *" }, overlap: "queue", catchUp: "skip" },
    ])
    await backend.registrations[0]!.trigger("report")
    await backend.registrations[1]!.trigger("reminders")
    expect(messages.map((message) => message.invoiceId)).toEqual(["inv-cron-reminder"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("intake: validates NDJSON lines by direct pull, rejecting malformed input", async () => {
    const lines = [
      JSON.stringify({ id: "inv-in-1", vendor: "Northwind Utilities", amount: 90, dueDate: "2026-07-09", description: "utility service" }),
      "not json",
      JSON.stringify({ id: "inv-in-2", vendor: "Fabrikam SaaS", amount: 1200 }),
      "",
      JSON.stringify({ id: "inv-in-3", vendor: "Contoso Hardware", amount: 300, dueDate: "2026-07-12", description: "cables" }),
    ]
    const scope = createScope({
      presets: [
        preset(database, await pgliteDatabase()),
        preset(intakeLines, (async function* () {
          yield* lines
        })()),
      ],
      tags: [provider(heuristic), clock({ now: () => now })],
    })
    const ctx = scope.createContext()

    const summary = await ctx.exec({ flow: intake })

    expect(summary).toEqual({ accepted: 2, rejected: 2 })
    expect((await ctx.exec({ flow: listPending })).map((item) => item.id)).toEqual(["inv-in-1", "inv-in-3"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("observability: OTel spans cover intake, store, model, review, and reminder edges", async () => {
    const recorded = recordingTracer()
    const messages: ReminderMessage[] = []
    const source = invoice("inv-otel-1", {
      vendor: "Northwind Utilities",
      amount: 420,
      dueDate: "2026-07-06",
      description: "electric utility service",
    })
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        observable.runtime({ sinks: [otel.sink({ tracer: recorded.tracer })] }),
        provider(scripted([json({
          vendor: source.vendor,
          amount: source.amount,
          dueDate: source.dueDate,
          category: "utilities",
        })])),
        notifier(collecting(messages)),
        clock({ now: () => now }),
        reminderRecipient("ap-test@company.local"),
        reminderWindowDays(3),
      ],
    })
    const ctx = scope.createContext()
    const processing = ctx.exec({ flow: ingest })

    await ctx.exec({ flow: enqueue, input: { invoices: [source] } })
    await ctx.exec({ flow: awaitDrained })
    await ctx.exec({ flow: reviewCount })
    await ctx.exec({ flow: sendReminders })

    expect(messages.map((message) => message.invoiceId)).toEqual(["inv-otel-1"])
    expect(recorded.names()).toEqual(expect.arrayContaining([
      "invoice.enqueue",
      "invoice.listPending",
      "invoice.listStored",
      "invoice.markReminderSent",
      "invoice.reviewCount",
      "invoice.save",
      "invoice.sendReminders",
      "client.send",
      "model.complete",
      "model.stub",
    ].sort()))
    await ctx.exec({ flow: stop })
    const [ingestOutcome] = await Promise.allSettled([processing])
    expect(ingestOutcome.status).toBe("fulfilled")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("routes: domain flows import invoices, map parse errors, and report health data", async () => {
    const source = invoice("inv-server-1", {
      vendor: "Northwind Utilities",
      amount: 420,
      dueDate: "2026-07-04",
      description: "electric utility service",
    })
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(database, await pgliteDatabase())],
      tags: [
        observable.runtime({ sinks: [otel.sink()] }),
        provider(scripted([json({
          vendor: source.vendor,
          amount: source.amount,
          dueDate: source.dueDate,
          category: "utilities",
        })])),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()
    const processing = ctx.exec({ flow: ingest })
    const accepted = await ctx.exec({ flow: enqueue, rawInput: source })
    const rejected = ctx.exec({ flow: enqueue, rawInput: { id: "bad" } })
    await ctx.exec({ flow: awaitDrained })
    const report = await ctx.exec({ flow: dailyReport })
    const audit = await ctx.exec({ flow: listAudit })
    const pending = await ctx.exec({ flow: listPending })

    expect(accepted).toEqual({ accepted: 1 })
    await expect(rejected).rejects.toBeInstanceOf(ParseError)
    expect(report).toEqual({
      total: 1,
      byCategory: {
        utilities: 1,
        saas: 0,
        hardware: 0,
        other: 0,
      },
      overdue: ["inv-server-1"],
    })
    expect(audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "enqueued", entityId: "pending" }),
      expect.objectContaining({ action: "imported", entityId: "inv-server-1" }),
    ]))
    expect({ ok: true, pending: pending.length }).toEqual({ ok: true, pending: 0 })
    await ctx.exec({ flow: stop })
    const [ingestOutcome] = await Promise.allSettled([processing])
    expect(ingestOutcome.status).toBe("fulfilled")
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
