import { atom } from "@pumped-fn/lite"

const simpleAtom = atom({
  factory: (ctx) => 42
})
const configAtom = atom({
  factory: (ctx) => ({ port: 3000 })
})
