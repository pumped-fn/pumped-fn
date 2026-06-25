import { createScope, flow, tags, typed } from "@pumped-fn/lite"
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
} from "@pumped-fn/agent-sdk"
import { kit } from "@pumped-fn/agent-sdk-test"

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

const summarizeModel: Model = {
  complete: (_ctx, request) => ({
    content: `summary:${request.messages.at(-1)?.content ?? ""}`,
    stop: true,
  }),
}

const summarize = agent({
  name: "summarize",
  tags: [agentModel(summarizeModel)],
})

export function triage(provider: Model) {
  return agent({
    name: "triage",
    tags: [agentModel(provider)],
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
}

export const model: Model = {
  complete: (_ctx, request) => request.loadedSkills.length === 0
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

export const box = sandbox({
  readFile: (path) => `file:${path}`,
  writeFile: () => undefined,
  exec: (command, args = []) => ({
    stdout: [command, ...args].join(" "),
    stderr: "",
    exitCode: 0,
  }),
})

export async function runLocal() {
  const target = triage(model)
  const { extensions, log } = kit()
  const scope = createScope({
    extensions,
    tags: [box],
  })
  const ctx = scope.createContext({
    tags: [workflowRun({ taskId: "ticket-42", runId: "run-1" })],
  })
  const result = await ctx.exec({
    flow: target.turn,
    input: { prompt: "triage ticket 42" },
  })
  const trace = await ctx.resolve(events)
  const run = await inspect(log, { taskId: "ticket-42", runId: "run-1" })
  await ctx.close()
  await scope.dispose()
  return { result, trace: trace.events, run }
}

export async function runThread() {
  const target = triage(model)
  const scope = createScope({ tags: [box] })
  const ctx = scope.createContext()
  const thread = session("support-thread")
  await send(ctx, thread, target, { prompt: "one" })
  const result = await send(ctx, thread, target, { prompt: "two" })
  const state = ctx.scope.controller(thread).get().state
  await ctx.close()
  await scope.dispose()
  return { result, state }
}

export async function runHttp() {
  const scope = createScope({ tags: [box] })
  const ctx = scope.createContext()
  const handle = http({ agent: triage(model) })
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

export async function runSuite(targetLog?: RunLog) {
  const target = triage(model)
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
    agent: target,
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
  const scope = createScope({ extensions, tags: [box] })
  const ctx = scope.createContext()
  const report = await runEval(ctx, evaluation)
  await ctx.close()
  await scope.dispose()
  return summary(report)
}

export const daily = schedule({
  name: "daily-triage",
  agent: triage(model),
  input: () => ({ prompt: "triage daily queue" }),
})
