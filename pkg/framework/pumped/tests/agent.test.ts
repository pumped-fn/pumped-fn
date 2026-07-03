import { createScope, flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { agent, model, tool, type Model } from "@pumped-fn/agent-sdk"
import { kit } from "@pumped-fn/agent-sdk-test"
import { normalizeAgentEntry } from "../src/runtime/agent"
import { createServer } from "../src/runtime/serve"
import { runCli } from "../src/runtime/cli"
import type { Manifest } from "../src/runtime/manifest"

const scripted: Model = {
  complete: (_ctx, request) => ({
    content: `reply:${request.messages.at(-1)?.content ?? ""}`,
    stop: true,
  }),
}

const greeter = agent({
  name: "greeter",
  instructions: "Greet the caller.",
  tags: [model(scripted)],
  tools: [
    tool({
      description: "Looks something up",
      flow: flow({
        name: "lookup",
        parse: typed<{ id: string }>(),
        factory: (ctx) => ({ id: ctx.input.id }),
      }),
    }),
  ],
})

describe("normalizeAgentEntry", () => {
  it("extracts flow and metadata from an Agent struct", () => {
    const normalized = normalizeAgentEntry(greeter)

    expect(normalized.flow).toBe(greeter.turn)
    expect(normalized.agent).toEqual({
      name: "greeter",
      description: undefined,
      tools: ["lookup"],
      skills: [],
      subagents: [],
    })
  })

  it("passes plain flows through with no agent metadata", () => {
    const plain = flow({ factory: () => ({ ok: true }) })
    expect(normalizeAgentEntry(plain)).toEqual({ flow: plain })
  })
})

describe("agents entry kind", () => {
  it("mounts POST /agents/<name> and runs the turn flow", async () => {
    const { extensions } = kit()
    const manifest: Manifest = {
      app: { extensions },
      entries: [{ kind: "agents", name: "greeter", file: "virtual", ...normalizeAgentEntry(greeter) }],
    }

    const { app } = createServer(manifest)
    const response = await app.request("/agents/greeter", {
      method: "POST",
      body: JSON.stringify({ prompt: "hi" }),
      headers: { "content-type": "application/json" },
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.content).toBe("reply:hi")
  })

  it("is runnable through the CLI as `agent <name>`", async () => {
    const { extensions } = kit()
    const manifest: Manifest = {
      app: { extensions },
      entries: [{ kind: "agents", name: "greeter", file: "virtual", ...normalizeAgentEntry(greeter) }],
    }

    const lines: string[] = []
    await runCli(manifest, ["agent", "greeter", "--json", JSON.stringify({ prompt: "hi" })], {
      out: (line) => lines.push(line),
      err: () => {},
    })

    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!).content).toBe("reply:hi")
  })
})
