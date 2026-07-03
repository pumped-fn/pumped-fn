import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import { claude, type ClaudeOptions } from "@pumped-fn/sdk-claude"
import { codex, type CodexOptions } from "@pumped-fn/sdk-codex"
import { sandbox as bash } from "@pumped-fn/sdk-just-bash"
import {
  agent,
  events,
  http,
  includes,
  inspect,
  judge,
  model as agentModel,
  runEval,
  sandbox,
  schedule,
  session,
  send,
  skill,
  sub,
  suite,
  summary,
  tool,
  used,
  workflowRun,
  type Model,
  type RunLog,
} from "@pumped-fn/sdk"
import { kit } from "@pumped-fn/sdk-test"

const loadTicket = tool({
  description: "Load ticket details.",
  flow: flow({
    name: "load-ticket",
    parse: typed<{ id: string }>(),
    factory: (ctx) => ({ id: ctx.input.id, title: `ticket:${ctx.input.id}` }),
  }),
})

const readWorkspace = tool({
  description: "Read a workspace file.",
  flow: flow({
    name: "read-workspace",
    parse: typed<{ path: string }>(),
    deps: { sandbox: tags.required(sandbox) },
    factory: (ctx, deps) => deps.sandbox.readFile(ctx.input.path),
  }),
})

const summarize = agent({
  name: "summarize",
})

export const triage = agent({
  name: "triage",
  instructions: "Triage support tickets with tools, skills, and delegated summaries.",
  skills: [
    skill({
      name: "policy",
      description: "Ticket routing policy.",
      content: "Escalate unclear incidents.",
    }),
  ],
  tools: [loadTicket, readWorkspace],
  subagents: [
    sub({
      description: "Summarizes ticket context.",
      agent: summarize,
    }),
  ],
})

export const model: Model = {
  complete: (_ctx, request) => request.agentName === "summarize"
    ? {
        content: `summary:${request.messages.at(-1)?.content ?? ""}`,
        stop: true,
      }
    : request.loadedSkills.length === 0
    ? {
        content: "loading policy",
        skillCalls: [{ name: "policy" }],
      }
    : request.round === 1
    ? {
        content: "checking",
        toolCalls: [
          { name: "load-ticket", input: { id: "42" } },
          { name: "read-workspace", input: { path: "README.md" } },
        ],
        subagentCalls: [{ name: "summarize", input: { prompt: "ticket 42" } }],
      }
    : {
        content: `ready:${request.messages.filter((message) => message.role !== "assistant").map((message) => message.content).join("|")}`,
        stop: true,
      },
}

export const local = sandbox({
  readFile: (path) => `file:${path}`,
  writeFile: () => undefined,
  exec: (command, args = []) => ({
    stdout: [command, ...args].join(" "),
    stderr: "",
    exitCode: 0,
  }),
})

export const workspace = bash({
  options: {
    files: {
      "/workspace/README.md": "file:README.md",
    },
    cwd: "/workspace",
  },
})

export async function runLocal(provider = agentModel(model), environment = local) {
  const { extensions, log } = kit()
  const scope = createScope({
    extensions,
    tags: [environment, provider],
  })
  const ctx = scope.createContext({
    tags: [workflowRun({ taskId: "ticket-42", runId: "run-1" })],
  })
  const result = await ctx.exec({
    flow: triage.turn,
    input: { prompt: "triage ticket 42" },
  })
  const trace = await ctx.resolve(events)
  const run = await inspect(log, { taskId: "ticket-42", runId: "run-1" })
  await ctx.close()
  await scope.dispose()
  return { result, trace: trace.events, run }
}

export function runCodex(options: CodexOptions = {}) {
  return runLocal(codex(options), workspace)
}

export function runClaude(options: ClaudeOptions = {}) {
  return runLocal(claude(options), workspace)
}

export async function runThread(provider = agentModel(model), environment = local) {
  const scope = createScope({ tags: [environment, provider] })
  const ctx = scope.createContext()
  const thread = session("support-thread")
  await send(ctx, thread, triage, { prompt: "one" })
  const result = await send(ctx, thread, triage, { prompt: "two" })
  const state = ctx.scope.controller(thread).get().state
  await ctx.close()
  await scope.dispose()
  return { result, state }
}

export async function runHttp(provider = agentModel(model), environment = local) {
  const scope = createScope({ tags: [environment, provider] })
  const ctx = scope.createContext()
  const handle = http({ agent: triage })
  const response = await ctx.exec({
    flow: handle,
    input: new Request("https://agent.local/run", {
      method: "POST",
      body: JSON.stringify({ prompt: "triage ticket 42" }),
    }),
  })
  const body = await response.json()
  await ctx.close()
  await scope.dispose()
  return body
}

export async function runSuite(targetLog?: RunLog, provider = agentModel(model), environment = local) {
  const accepts = judge({
    name: "accepts",
    evaluate: () => ({ name: "accepts", passed: true, score: 1 }),
  })
  const grounded = judge({
    name: "grounded",
    evaluate: () => ({ name: "grounded", passed: true, score: 1 }),
  })
  const evaluation = suite({
    name: "triage",
    agent: triage,
    cases: [
      {
        name: "uses tools and answers",
        input: { prompt: "triage ticket 42" },
        checks: [used("load-ticket"), includes("ready")],
      },
    ],
    judges: [accepts, grounded],
  })
  const { extensions } = kit({ log: targetLog })
  const scope = createScope({ extensions, tags: [environment, provider] })
  const ctx = scope.createContext()
  const report = await runEval(ctx, evaluation)
  await ctx.close()
  await scope.dispose()
  return summary(report)
}

export const daily = schedule({
  name: "daily-triage",
  agent: triage,
  input: () => ({ prompt: "triage daily queue" }),
})
