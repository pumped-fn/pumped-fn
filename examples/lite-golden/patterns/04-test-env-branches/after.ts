import { atom, flow, typed } from "@pumped-fn/lite"

export interface ReceiptInput {
  id: string
  amount: number
}

export interface ReceiptStore {
  readonly name: string
  readonly records: ReceiptInput[]
  submit(receipt: ReceiptInput): Promise<string>
}

export interface ReceiptResult {
  id: string
  storedBy: string
  confirmation: string
  totalRecords: number
}

export function createMemoryReceiptStore(): ReceiptStore {
  const records: ReceiptInput[] = []

  return {
    name: "memory-ledger",
    records,
    async submit(receipt) {
      const totalRecords = records.push(receipt)
      return `stored:${totalRecords}:${receipt.id}:${receipt.amount}`
    },
  }
}

export const deliveryStore = atom<ReceiptStore>({
  factory: () => createMemoryReceiptStore(),
})

export const submitReceipt = flow({
  parse: typed<ReceiptInput>(),
  deps: { store: deliveryStore },
  factory: async (ctx, { store }): Promise<ReceiptResult> => {
    const confirmation = await store.submit(ctx.input)

    return {
      id: ctx.input.id,
      storedBy: store.name,
      confirmation,
      totalRecords: store.records.length,
    }
  },
})
