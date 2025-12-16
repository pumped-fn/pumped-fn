import { provide } from "@pumped-fn/core-next"

const simpleAtom = atom({
  factory: (ctx) => 42
})
const configAtom = atom({
  factory: (ctx) => ({ port: 3000 })
})
