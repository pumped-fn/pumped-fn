import { bench, describe } from "vitest"
import { consume } from "./graphs"

const map = new Map([["k", 1]])

describe("baselines (interpretation floors)", () => {
  bench("Map.get", () => {
    consume(map.get("k"))
  })

  bench("object literal allocation", () => {
    consume({ a: 1, b: 2 })
  })

  bench("await Promise.resolve(value)", async () => {
    consume(await Promise.resolve(1))
  })

  bench("await new microtask chain (.then)", async () => {
    consume(await Promise.resolve(1).then((v) => v))
  })
})
