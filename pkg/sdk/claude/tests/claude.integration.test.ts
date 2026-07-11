import { createScope } from "@pumped-fn/lite"
import { expect, it } from "vitest"
import { claudeConfig, claudeTurn } from "../src/index"

const integration = it.skipIf(process.env["PUMPED_INTEGRATION"] !== "1")

integration("invokes the authenticated Claude CLI", async () => {
  const scope = createScope({ tags: [claudeConfig({ auth: { kind: "global" }, isolate: false })] })
  const ctx = scope.createContext()

  await expect(ctx.exec({
    flow: claudeTurn,
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
