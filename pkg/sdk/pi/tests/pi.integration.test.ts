import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all"
import { createScope } from "@pumped-fn/lite"
import { expect, it } from "vitest"
import { piConfig, piTurn } from "../src/index"

const selected = getBuiltinModels("anthropic")[0]
const integration = it.skipIf(
  process.env["PUMPED_INTEGRATION"] !== "1" || !process.env["ANTHROPIC_API_KEY"] || !selected,
)

integration("invokes pi-ai with a configured provider key", async () => {
  const scope = createScope({
    tags: [piConfig({ provider: "anthropic", modelId: selected!.id, apiKeyEnv: "ANTHROPIC_API_KEY" })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({
    flow: piTurn,
    input: {
      agentName: "probe",
      instructions: "Reply with the single word ready.",
      messages: [{ role: "user", content: "ready?" }],
      tools: [],
      skills: [],
      loadedSkills: [],
      subagents: [],
      round: 0,
    },
  })).resolves.toMatchObject({ content: expect.stringMatching(/ready/i) })

  await ctx.close()
  await scope.dispose()
}, 120_000)
