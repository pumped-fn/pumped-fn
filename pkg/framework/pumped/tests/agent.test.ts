import { controller, flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import type { Model, ModelRequest } from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as validation from "@pumped-fn/sdk/validation"
import { kit } from "@pumped-fn/sdk-test"
import { normalizeAgentEntry } from "../src/runtime/agent"
import { createServer } from "../src/runtime/serve"
import { runCli } from "../src/runtime/cli"
import type { Manifest } from "../src/runtime/manifest"

const scripted: Model = flow({
  name: "scripted-model",
  parse: typed<ModelRequest>(),
  factory: (ctx) => ({
    content: `reply:${ctx.input.messages.at(-1)?.content ?? ""}`,
    stop: true,
  }),
})

const authority = session.createAuthority({
  tenant: "test",
  roots: [],
  permissions: [],
  tools: [],
  sandbox: { roots: [], commands: [], write: false, network: false },
})

const validator = validation.standard({
  id: "test",
  toJsonSchema: () => true,
})

const greeterRole = agent.role({
  name: "greeter",
  version: "1",
  instructions: "Greet the caller.",
})
const greeterTurn = agent.turn({ name: "greeter.turn", role: greeterRole })
const runGreeter = session.run({ name: "greeter.run", turn: greeterTurn })
const greeterEntry = flow({
  name: "greeter",
  parse: typed<agent.TurnInput>(),
  deps: { session: session.session, run: controller(runGreeter) },
  factory: (ctx, { run }) => run.exec({
    input: {
      work: { id: "greeter-work", branchId: "main", role: "greeter", policy: "all", authority: {} },
      input: ctx.input,
    },
  }),
})
const greeter = {
  name: "greeter",
  turn: greeterEntry,
  tools: [],
  skills: [],
  subagents: [],
}

describe("normalizeAgentEntry", () => {
  it("accepts an SDK 3 turn adapter with structural metadata", () => {
    const normalized = normalizeAgentEntry(greeter)

    expect(normalized.flow).toBe(greeterEntry)
    expect(normalized.agent).toEqual({
      name: "greeter",
      description: undefined,
      tools: [],
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
  it("mounts POST /agents/<name> and runs the session turn flow", async () => {
    const { extensions } = kit()
    const manifest: Manifest = {
      app: { extensions, tags: sessionTags() },
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
      app: { extensions, tags: sessionTags() },
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

function sessionTags() {
  return [
    session.authority(authority),
    session.record(sessionRecord()),
    session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
    agent.attempt(agent.fromModel(scripted)),
    validation.engine(validator),
  ]
}

function sessionRecord(): session.SessionRecord {
  return Object.freeze({
    id: "greeter-session",
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
    currentBranchId: "main",
    branches: [{
      id: "main",
      version: 0,
      createdBy: "bootstrap",
      authorityFingerprint: authority.fingerprint,
      authority,
      evidence: [],
    }],
    work: [],
    attempts: [],
    invocations: [],
    artifacts: [],
    memory: [],
    schedules: [],
    providerContinuations: {},
    nextEventSequence: 1,
  })
}
