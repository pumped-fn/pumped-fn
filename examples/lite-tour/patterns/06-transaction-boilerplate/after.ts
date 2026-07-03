import { controller, flow, resource, typed } from "@pumped-fn/lite"

export type LedgerEntry = {
  readonly account: string
  readonly deltaCents: number
}

export type TxEvent =
  | { readonly type: "begin"; readonly txId: string }
  | ({ readonly type: "write"; readonly txId: string } & LedgerEntry)
  | { readonly type: "commit"; readonly txId: string }
  | { readonly type: "rollback"; readonly txId: string }
  | { readonly type: "release"; readonly txId: string }

export type TxConnection = {
  readonly id: string
  write(entry: LedgerEntry): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  release(): Promise<void>
}

export type TxStore = {
  begin(): Promise<TxConnection>
}

export type TransferInput = {
  readonly from: string
  readonly to: string
  readonly cents: number
}

export type TransferResult = {
  readonly from: string
  readonly to: string
  readonly cents: number
  readonly txId: string
}

export function createLedgerStore(events: TxEvent[]): TxStore {
  let nextId = 0
  return {
    async begin() {
      const txId = `tx-${++nextId}`
      events.push({ type: "begin", txId })
      return {
        id: txId,
        async write(entry) {
          events.push({ type: "write", txId, account: entry.account, deltaCents: entry.deltaCents })
        },
        async commit() {
          events.push({ type: "commit", txId })
        },
        async rollback() {
          events.push({ type: "rollback", txId })
        },
        async release() {
          events.push({ type: "release", txId })
        },
      }
    },
  }
}

export const txStore = resource({
  name: "example-ledger-store",
  factory: () => createLedgerStore([]),
})

export const tx = resource({
  name: "example-ledger-tx",
  ownership: "current",
  deps: { store: txStore },
  factory: async (ctx, { store }) => {
    const tx = await store.begin()
    ctx.onClose((result) => result.ok ? tx.commit() : tx.rollback())
    ctx.cleanup(() => tx.release())
    return tx
  },
})

export const writeAuditEntry = flow({
  name: "write-audit-entry",
  parse: typed<{ txId: string }>(),
  deps: { tx },
  factory: async (ctx, { tx }) => {
    await tx.write({ account: "audit", deltaCents: 0 })
    return ctx.input.txId
  },
})

export const transferFunds = flow({
  name: "transfer-funds",
  parse: typed<TransferInput>(),
  deps: { tx, writeAuditEntry: controller(writeAuditEntry) },
  factory: async (ctx, { tx, writeAuditEntry }) => {
    await tx.write({ account: ctx.input.from, deltaCents: -ctx.input.cents })
    await tx.write({ account: ctx.input.to, deltaCents: ctx.input.cents })
    await writeAuditEntry.exec({ input: { txId: tx.id } })
    return {
      from: ctx.input.from,
      to: ctx.input.to,
      cents: ctx.input.cents,
      txId: tx.id,
    }
  },
})
