import { createScope } from "@pumped-fn/lite"
import { expect, it } from "vitest"
import { codexAcpConfig, codexAcpTurn, codexConfig, codexTurn } from "../src/index"

const integration = it.skipIf(process.env["PUMPED_INTEGRATION"] !== "1")

integration("invokes the authenticated Codex CLI", async () => {
  const scope = createScope({ tags: [codexConfig({ auth: { kind: "global" }, isolate: false })] })
  const ctx = scope.createContext()

  await expect(ctx.exec({
    flow: codexTurn,
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

integration("invokes Codex through ACP", async () => {
  const scope = createScope({ tags: [codexAcpConfig({ permission: "deny" })] })
  const ctx = scope.createContext()

  await expect(ctx.exec({
    flow: codexAcpTurn,
    input: {
      agentName: "probe",
      instructions: "Reply with JSON content containing the word ready.",
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
