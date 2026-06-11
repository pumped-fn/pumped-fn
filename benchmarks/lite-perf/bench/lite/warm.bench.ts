import { bench, describe } from "vitest"
import { consume, resolvedController } from "./graphs"

const { scope, atom: a, ctrl } = await resolvedController(() => 1)

describe("warm paths (already resolved)", () => {
  bench("scope.resolve()", async () => {
    consume(await scope.resolve(a))
  })

  bench("controller.get()", () => {
    consume(ctrl.get())
  })

  bench("controller.state", () => {
    consume(ctrl.state)
  })

  bench("scope.controller() lookup", () => {
    consume(scope.controller(a))
  })
})
