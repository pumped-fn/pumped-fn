import { describe } from "vitest"
import { bench } from "../quick"
import { consume, resolvedController } from "./graphs"

const { scope, atom: a, ctrl } = await resolvedController(() => 1)
const batch = 256

describe("warm paths (already resolved)", () => {
  bench("scope.resolve()", async () => {
    for (let index = 0; index < batch; index++) {
      consume(await scope.resolve(a))
    }
  })

  bench("controller.get()", () => {
    for (let index = 0; index < batch; index++) {
      consume(ctrl.get())
    }
  })

  bench("controller.state", () => {
    for (let index = 0; index < batch; index++) {
      consume(ctrl.state)
    }
  })

  bench("scope.controller() lookup", () => {
    for (let index = 0; index < batch; index++) {
      consume(scope.controller(a))
    }
  })
})
