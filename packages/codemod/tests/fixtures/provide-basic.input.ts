import { provide } from "@pumped-fn/core-next"

const simpleAtom = provide((ctl) => 42)
const configAtom = provide((controller) => ({ port: 3000 }))
