import { createScope } from "@pumped-fn/lite"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import { expect, it } from "vitest"
import { attemptStub, sessionStoreStub } from "../src/index"

it("streams attempt events and returns the final model response", async () => {
  const attempt = attemptStub({
    events: [
      { type: "content_delta", content: "hel" },
      { type: "content_delta", content: "lo" },
    ],
    result: { content: "hello", stop: true },
  })
  const scope = createScope({ tags: [agent.attempt(attempt)] })
  const ctx = scope.createContext()
  const stream = ctx.execStream({ flow: agent.invoke, input: request() })
  const events: agent.ModelEvent[] = []

  for await (const event of stream) events.push(event)

  expect(events).toEqual([
    { type: "content_delta", content: "hel" },
    { type: "content_delta", content: "lo" },
  ])
  await expect(stream.result).resolves.toEqual({ content: "hello", stop: true })
  await ctx.close()
  await scope.dispose()
})

it("provides isolated session stores through explicit flow bindings", async () => {
  const record = sessionRecord("session-a")
  const first = sessionStoreStub([record])
  const second = sessionStoreStub([sessionRecord("session-b")])
  const scope = createScope({ tags: [first.binding.load, first.binding.commit] })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: session.load, input: { id: record.id } })).resolves.toBe(record)
  await expect(ctx.exec({
    flow: session.commit,
    input: { record: { ...record, status: "finished" }, expectedVersion: 0 },
  })).resolves.toEqual({ version: 1 })
  await expect(ctx.exec({
    flow: session.commit,
    input: { record, expectedVersion: 0 },
  })).rejects.toThrow('Session "session-a" version conflict')
  expect(first.records.get(record.id)).toMatchObject({ version: 1, status: "finished" })
  expect(second.records.get("session-b")).toMatchObject({ version: 0, status: "open" })

  await ctx.close()
  await scope.dispose()
})

it("creates a new test-owned scope and bound session context at each use site", async () => {
  const authority = session.createAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    permissions: [],
    tools: [],
    sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
  })
  const firstScope = createScope()
  const firstRoot = firstScope.createContext()
  const first = firstScope.createContext({
    parent: firstRoot,
    tags: [
      session.authority(authority),
      session.record(sessionRecord("session-a", authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
    ],
  })
  const secondScope = createScope()
  const secondRoot = secondScope.createContext()
  const second = secondScope.createContext({
    parent: secondRoot,
    tags: [
      session.authority(authority),
      session.record(sessionRecord("session-b", authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
    ],
  })

  await expect(first.resolve(session.session)).resolves.toMatchObject({ record: { id: "session-a" } })
  await expect(second.resolve(session.session)).resolves.toMatchObject({ record: { id: "session-b" } })
  expect(firstScope).not.toBe(secondScope)
  expect(first).not.toBe(second)

  await first.close()
  await firstRoot.close()
  await firstScope.dispose()
  await second.close()
  await secondRoot.close()
  await secondScope.dispose()
})

function request() {
  return {
    agentName: "test",
    instructions: "",
    messages: [],
    tools: [],
    skills: [],
    loadedSkills: [],
    subagents: [],
    round: 0,
  }
}

function sessionRecord(id: string, authority = session.createAuthority({
  tenant: "tenant-a",
  roots: [],
  permissions: [],
  tools: [],
  sandbox: { roots: [], commands: [], write: false, network: false },
})): session.SessionRecord {
  return Object.freeze({
    id,
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
    currentBranchId: "main",
    branches: [{
      id: "main",
      version: 0,
      createdBy: "root",
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
    nextEventSequence: 0,
  })
}
