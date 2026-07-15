import { describe, expect, it } from "vitest"
import { formatModelPrompt } from "../src/index"

describe("sdk public surface", () => {
  it("includes a canonically ordered tool schema in model prompts", () => {
    const prompt = formatModelPrompt({
      agentName: "analyst",
      instructions: "",
      messages: [],
      tools: [{
        name: "inspect",
        description: "Inspect data.",
        inputSchema: { properties: { "é": { type: "number" }, z: { type: "string" } }, type: "object" },
      }],
      skills: [],
      loadedSkills: [],
      subagents: [],
      round: 0,
    })

    expect(prompt).toContain(
      'Input schema: {"properties":{"z":{"type":"string"},"é":{"type":"number"}},"type":"object"}',
    )
  })
})
