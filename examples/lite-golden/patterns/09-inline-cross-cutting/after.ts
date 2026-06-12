import { atom, flow, resource, tag, tags, typed, type Lite } from "@pumped-fn/lite"

export type QuoteInput = {
  readonly items: readonly number[]
}

export type Quote = {
  readonly subtotalCents: number
  readonly taxBasisPoints: number
  readonly feeCents: number
  readonly totalCents: number
}

export type ReceiptInput = {
  readonly itemCount: number
  readonly subtotalCents: number
}

export type Receipt = ReceiptInput & {
  readonly persisted: true
}

export type ExecRecord = {
  readonly kind: "exec"
  readonly name: string | undefined
  durationMs: number
  ok: boolean
}

export type ResolveRecord = {
  readonly kind: "resolve"
  readonly targetKind: "atom" | "resource"
}

export type InitRecord = {
  readonly kind: "init"
}

export type DisposeRecord = {
  readonly kind: "dispose"
}

export type ObservabilityRecord = ExecRecord | ResolveRecord | InitRecord | DisposeRecord

export type ObservabilityOptions = {
  readonly now: () => number
  readonly seedTraceId?: string
  readonly failInit?: boolean
  readonly transformExec?: (record: ExecRecord, value: unknown) => unknown
}

export const traceId = tag<string>({
  label: "golden.trace-id",
  default: "trace-missing",
})

export const taxRate = atom({
  factory: () => 875,
})

export const requestFee = resource({
  name: "request-fee",
  factory: () => ({ cents: 30 }),
})

export function runHandlingFee(_ctx: Lite.ExecutionContext, totalCents: number): number {
  return totalCents + 25
}

export function priceItems(_ctx: Lite.ExecutionContext, items: readonly number[]): number {
  return items.reduce((total, item) => total + item, 0)
}

export const quote = flow({
  name: "quote-total",
  parse: typed<QuoteInput>(),
  deps: { taxRate, fee: requestFee },
  factory: (ctx, { taxRate, fee }): Quote => {
    const subtotalCents = priceItems(ctx, ctx.input.items)
    return {
      subtotalCents,
      taxBasisPoints: taxRate,
      feeCents: fee.cents,
      totalCents: subtotalCents + Math.round(subtotalCents * taxRate / 10_000) + fee.cents,
    }
  },
})

export const persistReceipt = flow({
  name: "persist-receipt",
  parse: typed<ReceiptInput>(),
  factory: (ctx): Receipt => ({
    itemCount: ctx.input.itemCount,
    subtotalCents: ctx.input.subtotalCents,
    persisted: true,
  }),
})

export const checkout = flow({
  name: "checkout",
  parse: typed<QuoteInput>(),
  factory: async (ctx): Promise<Receipt> => {
    return ctx.exec({
      flow: persistReceipt,
      input: {
        itemCount: ctx.input.items.length,
        subtotalCents: await ctx.exec({
          fn: priceItems,
          name: "price-items",
          params: [ctx.input.items],
        }),
      },
    })
  },
})

export const traceReport = flow({
  name: "trace-report",
  deps: { traceId: tags.required(traceId) },
  factory: (_ctx, { traceId }) => traceId,
})

export const failingAudit = flow({
  name: "failing-audit",
  factory: () => {
    throw new Error("audit sink rejected")
  },
})

export function observability(
  records: ObservabilityRecord[],
  options: ObservabilityOptions
): Lite.Extension {
  let seededTraceId: string | undefined
  return {
    name: "golden-observability",
    init() {
      if (options.failInit) throw new Error("observability init failed")
      seededTraceId = options.seedTraceId
      records.push({ kind: "init" })
    },
    dispose() {
      records.push({ kind: "dispose" })
    },
    wrapResolve: async (next, event) => {
      records.push({ kind: "resolve", targetKind: event.kind })
      return next()
    },
    wrapExec: async (next, _target, ctx) => {
      if (seededTraceId !== undefined) ctx.data.setTag(traceId, seededTraceId)
      const started = options.now()
      const record: ExecRecord = {
        kind: "exec",
        name: ctx.name,
        durationMs: 0,
        ok: true,
      }
      records.push(record)
      try {
        const value = await next()
        record.durationMs = options.now() - started
        if (options.transformExec) return options.transformExec(record, value)
        return value
      } catch (error) {
        record.durationMs = options.now() - started
        record.ok = false
        throw error
      }
    },
  }
}
