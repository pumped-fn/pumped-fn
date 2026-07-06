import { createScope, isStreamingExec, type Lite } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { scheduler, type Scheduler } from "@pumped-fn/lite-extension-scheduler"
import { inspect, model as provider, workflowRun, type Model } from "@pumped-fn/sdk"
import { kit } from "@pumped-fn/sdk-test"
import { describe, expect, expectTypeOf, it } from "vitest"
import { prepareDatabase } from "../src/database-lifecycle"
import {
  enqueue,
  ingest,
  intake,
} from "../src/intake"
import {
  dailyReport,
  dailyReportJob,
  sendReminders,
  sendRemindersJob,
} from "../src/reporting"
import { importBatch, triage } from "../src/triage"
import {
  clock,
  database,
  databaseEngine,
  databaseStartup,
  intakeLines,
  mailer,
  opsHeartbeat,
  reminderRecipient,
  reminderWindowDays,
} from "../src/runtime"
import { memoryDatabase } from "./support/database"
import { memoryMailer } from "./support/mailer"
import { heuristic } from "./support/model"
import {
  type Category,
  type Classification,
  type ImportProgress,
  type ImportSummary,
  type Invoice,
  type Risk,
  type StoredInvoice,
} from "../src/types"

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
  return {
    complete: () => ({
      content: outputs[index++] ?? outputs.at(-1) ?? json(),
      stop: true,
    }),
  }
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
    model: {
      complete: async () => {
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
      },
    } satisfies Model,
    firstStarted,
    releaseFirst,
    calls: () => calls,
  }
}

async function waitForImported(scope: Lite.Scope, count: number): Promise<string[]> {
  const store = await scope.resolve(database)
  for await (const invoices of store.watchStored()) {
    const ids = invoices.map((invoice) => invoice.id)
    if (ids.length === count) return ids
  }
  throw new Error("Scope disposed before import completed")
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

function scopeWith(model: Model) {
  const runtime = kit()
  return {
    ...runtime,
    scope: createScope({
      extensions: runtime.extensions,
      tags: [
        provider(model),
        databaseEngine(memoryDatabase()),
        clock({ now: () => now }),
      ],
    }),
  }
}

interface ManualRegistration extends Scheduler.Registration {
  readonly spec: Parameters<Scheduler.Backend["register"]>[0]
  trigger(dedupKey?: string): Promise<void>
}

interface ManualBackend extends Scheduler.Backend {
  readonly registrations: ManualRegistration[]
}

function manualRegistration(
  spec: Parameters<Scheduler.Backend["register"]>[0],
  tick: Parameters<Scheduler.Backend["register"]>[1]
): ManualRegistration {
  let stopped = false
  return {
    spec,
    async trigger(dedupKey = "manual"): Promise<void> {
      if (stopped) throw new Error("Registration stopped")
      await tick({ key: `${spec.name}:${dedupKey}`, scheduledAt: now })
    },
    next: () => undefined,
    async stop(): Promise<void> {
      stopped = true
    },
  }
}

function manualBackend(): ManualBackend {
  const registrations: ManualRegistration[] = []
  return {
    registrations,
    register(
      spec: Parameters<Scheduler.Backend["register"]>[0],
      tick: Parameters<Scheduler.Backend["register"]>[1]
    ): Scheduler.Registration {
      const registration = manualRegistration(spec, tick)
      registrations.push(registration)
      return registration
    },
  }
}

describe("invoice triage patterns", () => {
  it("pattern: optional startup tag selects database migration lazily", async () => {
    const idle = createScope({
      tags: [
        databaseEngine({
          open: () => {
            throw new Error("database should not open without startup tag")
          },
        }),
      ],
    })
    const idleCtx = idle.createContext()

    await expect(idleCtx.exec({ flow: prepareDatabase })).resolves.toBeUndefined()
    await idleCtx.close({ ok: true })
    await idle.dispose()

    let opens = 0
    const active = createScope({
      tags: [
        databaseEngine({
          open: () => {
            opens += 1
            return memoryDatabase().open()
          },
        }),
        databaseStartup("migrate"),
      ],
    })
    const activeCtx = active.createContext()

    await expect(activeCtx.exec({ flow: prepareDatabase })).resolves.toMatchObject({
      currentVersion: 1,
      targetVersion: 1,
      pending: [],
      drift: [],
      appliedNow: [{ version: 1, name: "create_invoice_store" }],
    })
    expect(opens).toBe(1)
    expect((await (await active.resolve(database)).listAudit()).map((event) => event.action)).toEqual(["database.migrated"])
    await activeCtx.close({ ok: true })
    await active.dispose()
  })

  it("pattern: execStream consumption shows progress, interleaved triage steps, and .result summary", async () => {
    const first = invoice("inv-stream-1")
    const second = invoice("inv-stream-2", { vendor: "Contoso Hardware", amount: 4_500, description: "server hardware" })
    const { scope, log } = scopeWith(scripted([
      json({ vendor: first.vendor, amount: first.amount, dueDate: first.dueDate }),
      json({
        vendor: second.vendor,
        amount: second.amount,
        dueDate: second.dueDate,
        category: "hardware",
        risk: "review",
        reason: "hardware purchase",
      }),
    ]))
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
    const run = await inspect(log, { taskId: "stream", runId: "run-1" })
    expect(run.steps.map((step) => step.targetName)).toEqual([
      "invoice.model.complete",
      "invoice.classify",
      "invoice.save",
      "invoice.model.complete",
      "invoice.classify",
      "invoice.save",
    ])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: exec consumption drains generator progress and returns summary only", async () => {
    const { scope } = scopeWith(scripted([
      json({ risk: "review", reason: "manual approval" }),
      json(),
    ]))
    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "exec", runId: "run-1" })] })

    await expect(ctx.exec({
      flow: importBatch,
      input: { invoices: [invoice("inv-exec-1"), invoice("inv-exec-2")] },
    })).resolves.toEqual({ imported: 2, review: ["inv-exec-1"] })
    expect((await (await scope.resolve(database)).listStored()).map((item) => item.id)).toEqual(["inv-exec-1", "inv-exec-2"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: abandonment aborts a streaming batch without persisting unprocessed invoices", async () => {
    const closes: Lite.CloseResult[] = []
    const streaming: boolean[] = []
    const first = invoice("inv-abandon-1")
    const second = invoice("inv-abandon-2")
    const scope = createScope({
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
        databaseEngine(memoryDatabase()),
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
    expect((await (await scope.resolve(database)).listStored()).map((item) => item.id)).toEqual(["inv-abandon-1"])
    expect(closes[0]).toMatchObject({ ok: false, aborted: true })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: malformed model output becomes review classification without crashing", async () => {
    const { scope } = scopeWith(scripted(["not json"]))
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
    const scope = createScope()
    const feed = await scope.resolve(opsHeartbeat)
    const left = scope.resolveStream(opsHeartbeat)[Symbol.asyncIterator]()
    const right = scope.resolveStream(opsHeartbeat)[Symbol.asyncIterator]()
    const drained = scope.drain(opsHeartbeat, { take: 2 })
    const first = { source: "ops", checkedAt: "2026-07-05T12:00:00.000Z" }
    const second = { source: "ops", checkedAt: "2026-07-05T12:01:00.000Z" }
    const leftFirst = left.next()
    const rightFirst = right.next()

    feed.push(first)
    expect(await leftFirst).toEqual({ done: false, value: first })
    expect(await rightFirst).toEqual({ done: false, value: first })

    const leftSecond = left.next()
    const rightSecond = right.next()
    feed.push(second)
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
      tags: [
        provider(gate.model),
        databaseEngine(memoryDatabase()),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()
    const processing = ctx.exec({ flow: ingest })

    await ctx.exec({ flow: enqueue, input: { invoices: first } })
    await gate.firstStarted
    await Promise.all([
      ctx.exec({ flow: enqueue, input: { invoices: second } }),
      ctx.exec({ flow: enqueue, input: { invoices: third } }),
    ])
    gate.releaseFirst()

    const imported = await waitForImported(scope, all.length)
    expect([...imported].sort()).toEqual(all.map((item) => item.id).sort())
    expect(await (await scope.resolve(database)).listPending()).toEqual([])
    expect(gate.calls()).toBe(all.length)
    await ctx.close({ ok: true })
    await scope.dispose()
    await processing
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
      tags: [
        provider(gate.model),
        databaseEngine(memoryDatabase()),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()
    const store = await scope.resolve(database)
    const changes = store.watchPending()[Symbol.asyncIterator]()
    const interleave = (async () => {
      for (;;) {
        const next = await changes.next()
        if (next.done) return
        if (next.value.some((item) => item.id === first[0]!.id)) {
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

    const imported = await waitForImported(scope, all.length)
    expect([...imported].sort()).toEqual(all.map((item) => item.id).sort())
    expect(await store.listPending()).toEqual([])
    expect(gate.calls()).toBe(all.length)
    await ctx.close({ ok: true })
    await scope.dispose()
    await processing
  })

  it("pattern: changes ops view conflates review-count observations during import", async () => {
    const runtime = kit()
    const sink = logging.memory()
    const scope = createScope({
      extensions: [logging.extension(), ...runtime.extensions],
      tags: [
        logging.runtime({
          sinks: [sink],
          level: "info",
          flow: "errors",
        }),
        provider(scripted([
          json({ risk: "review", reason: "needs approval" }),
          json({ risk: "review", reason: "needs approval" }),
          json({ risk: "review", reason: "needs approval" }),
        ])),
        databaseEngine(memoryDatabase()),
        clock({ now: () => now }),
      ],
    })
    const log = scope.createContext()
    const logger = await log.resolve(logging.logger)
    const store = await scope.resolve(database)
    const changes = store.watchReviewCount()[Symbol.asyncIterator]()
    const observations: number[] = []
    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "changes", runId: "run-1" })] })
    const first = await changes.next()
    if (!first.done) {
      observations.push(first.value)
      logger.info("invoice.reviewQueue", { count: first.value })
    }

    await ctx.exec({
      flow: importBatch,
      input: { invoices: [invoice("inv-change-1"), invoice("inv-change-2"), invoice("inv-change-3")] },
    })
    const latest = await changes.next()
    if (!latest.done) {
      observations.push(latest.value)
      logger.info("invoice.reviewQueue", { count: latest.value })
    }
    await changes.return?.()
    expect(observations).toEqual([0, 3])
    expect(sink.records().map((record) => record.fields?.["count"])).toEqual([0, 3])
    await ctx.close({ ok: true })
    await log.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: reminders are idempotent and include both reminder-window boundaries", async () => {
    const messages = memoryMailer()
    const scope = createScope({
      tags: [
        databaseEngine(memoryDatabase({
          stored: [
            stored("inv-remind-today", "2026-07-05", "utilities", "auto-approve"),
            stored("inv-remind-horizon", "2026-07-08", "saas", "auto-approve"),
            stored("inv-remind-beyond", "2026-07-09", "saas", "auto-approve"),
            stored("inv-remind-done", "2026-07-06", "hardware", "review", "2026-07-04T00:00:00.000Z"),
          ],
        })),
        mailer(messages),
        clock({ now: () => now }),
        reminderRecipient("ap-test@company.local"),
        reminderWindowDays(3),
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: sendReminders })).resolves.toEqual({
      sent: 2,
      invoiceIds: ["inv-remind-today", "inv-remind-horizon"],
    })
    expect(messages.sent().map((message) => message.invoiceId)).toEqual(["inv-remind-today", "inv-remind-horizon"])
    expect(messages.sent().map((message) => message.to)).toEqual(["ap-test@company.local", "ap-test@company.local"])
    await expect(ctx.exec({ flow: sendReminders })).resolves.toEqual({ sent: 0, invoiceIds: [] })
    expect(messages.sent()).toHaveLength(2)
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("pattern: dailyReport summarizes totals, categories, and overdue invoices", async () => {
    const scope = createScope({
      tags: [
        databaseEngine(memoryDatabase({
          stored: [
            stored("inv-report-overdue", "2026-07-04", "utilities", "auto-approve"),
            stored("inv-report-today", "2026-07-05", "saas", "auto-approve"),
            stored("inv-report-review", "2026-07-10", "hardware", "review"),
          ],
        })),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()

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
    const backend = manualBackend()
    const messages = memoryMailer()
    const scope = createScope({
      tags: [
        databaseEngine(memoryDatabase({
          stored: [stored("inv-cron-reminder", "2026-07-06", "saas", "auto-approve")],
        })),
        mailer(messages),
        scheduler.backend(backend),
        reminderWindowDays(5),
        clock({ now: () => now }),
      ],
    })
    const ctx = scope.createContext()

    await ctx.resolve(dailyReportJob)
    await ctx.resolve(sendRemindersJob)
    expect(backend.registrations.map((registration) => registration.spec)).toMatchObject([
      { name: "invoice.dailyReport", cadence: { cron: "0 8 * * *" }, overlap: "skip", catchUp: "skip" },
      { name: "invoice.sendReminders", cadence: { cron: "0 9 * * *" }, overlap: "queue", catchUp: "skip" },
    ])
    await backend.registrations[0]!.trigger("report")
    await backend.registrations[1]!.trigger("reminders")
    expect(messages.sent().map((message) => message.invoiceId)).toEqual(["inv-cron-reminder"])
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
      tags: [provider(heuristic), databaseEngine(memoryDatabase()), clock({ now: () => now }), intakeLines((async function* () {
        yield* lines
      })())],
    })
    const ctx = scope.createContext()

    const summary = await ctx.exec({ flow: intake })

    expect(summary).toEqual({ accepted: 2, rejected: 2 })
    expect((await (await scope.resolve(database)).listPending()).map((invoice) => invoice.id)).toEqual(["inv-in-1", "inv-in-3"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
