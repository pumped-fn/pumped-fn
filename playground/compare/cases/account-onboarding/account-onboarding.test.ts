import { describe, expect, it } from "vitest"
import type { Lane } from "./contract"
import { awilix } from "./lanes/awilix"
import { effect } from "./lanes/effect"
import { inversify } from "./lanes/inversify"
import { plain } from "./lanes/plain"
import { pumped } from "./lanes/pumped"
import { runScenario } from "./scenario"

const lanes: Lane[] = [pumped, effect, awilix, inversify, plain]

describe.each(lanes)("$id", (lane) => {
  it("satisfies the account-onboarding contract", async () => {
    await expect(runScenario(lane)).resolves.toMatchObject({ lane: lane.id })
  })
})
