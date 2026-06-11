import { bench, describe } from "vitest"
import { atom, createScope } from "@pumped-fn/lite"
import { asyncChain, consume, syncChain, wide } from "./graphs"

const single = atom({ factory: () => 1 })
const singleAsync = atom({ factory: async () => 1 })
const chain10 = syncChain(10)
const chain100 = syncChain(100)
const achain10 = asyncChain(10)
const wide50 = wide(50)
const diamondLeft = atom({ deps: { h: chain10.head }, factory: (_c, d) => d.h + 1 })
const diamondRight = atom({ deps: { h: chain10.head }, factory: (_c, d) => d.h + 2 })
const diamondTip = atom({
  deps: { l: diamondLeft, r: diamondRight },
  factory: (_c, d) => d.l + d.r,
})

describe("creation", () => {
  bench("atom() no deps", () => {
    consume(atom({ factory: () => 1 }))
  })

  bench("createScope()", () => {
    consume(createScope())
  })
})

describe("cold resolve (fresh scope per iteration)", () => {
  bench("1 atom, sync factory", async () => {
    consume(await createScope().resolve(single))
  })

  bench("1 atom, async factory", async () => {
    consume(await createScope().resolve(singleAsync))
  })

  bench("chain depth 10, sync factories", async () => {
    consume(await createScope().resolve(chain10.leaf))
  })

  bench("chain depth 100, sync factories", async () => {
    consume(await createScope().resolve(chain100.leaf))
  })

  bench("chain depth 10, async factories", async () => {
    consume(await createScope().resolve(achain10.leaf))
  })

  bench("wide 50 sync deps", async () => {
    consume(await createScope().resolve(wide50))
  })

  bench("diamond on chain-10 base", async () => {
    consume(await createScope().resolve(diamondTip))
  })
})
