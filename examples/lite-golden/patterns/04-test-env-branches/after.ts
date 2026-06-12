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

export const deliveryStore = atom({
  factory: () => createMemoryReceiptStore(),
})

export const submitReceipt = flow({
  parse: typed<ReceiptInput>(),
  deps: { store: deliveryStore },
  factory: async (ctx, { store }) => {
    const confirmation = await store.submit(ctx.input)

    return {
      id: ctx.input.id,
      storedBy: store.name,
      confirmation,
      totalRecords: store.records.length,
    }
  },
})
