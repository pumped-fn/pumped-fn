import { createScope } from "@pumped-fn/lite"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import { expect, it } from "vitest"
import {
  attemptStubConfig,
  initialRecord,
  modelRequest,
  sessionKit,
  sessionStoreStub,
  testAuthority,
  validationStub,
} from "../src/index"

it("streams attempt events and returns the final model response", async () => {
  const attempt = attemptStubConfig({
    events: [
      { type: "content_delta", content: "hel" },
      { type: "content_delta", content: "lo" },
    ],
    result: { content: "hello", stop: true },
  })
  const scope = createScope({ tags: attempt })
  const ctx = scope.createContext()
  const stream = ctx.execStream({ flow: agent.invoke, input: modelRequest() })
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
  const authority = testAuthority({ tenant: "tenant-a" })
  const record = initialRecord("session-a", authority)
  const first = sessionStoreStub([record])
  const second = sessionStoreStub([initialRecord("session-b", authority)])
  const scope = createScope({ tags: [first.config, first.binding.load, first.binding.commit] })
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
  const authority = testAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    sandbox: { roots: ["/workspace"] },
  })
  const firstBundle = sessionKit({
    id: "session-a",
    authority,
    clock: { now: () => "2026-07-14T00:00:00.000Z" },
  })
  const firstScope = createScope({ tags: firstBundle.tags })
  const firstRoot = firstScope.createContext()
  const first = firstScope.createContext({ parent: firstRoot })
  const secondBundle = sessionKit({
    id: "session-b",
    authority,
    clock: { now: () => "2026-07-14T00:00:00.000Z" },
  })
  const secondScope = createScope({ tags: secondBundle.tags })
  const secondRoot = secondScope.createContext()
  const second = secondScope.createContext({ parent: secondRoot })

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

it("executes agent turns with one session test bundle", async () => {
  const bundle = sessionKit({
    id: "turn-session",
    role: {
      name: "greeter",
      version: "1",
      instructions: "Greet the caller.",
      maxRounds: 1,
    },
    respond: (request) => ({
      events: [{ type: "content_delta", content: "hello" }],
      result: { content: `reply:${request.messages.at(-1)?.content ?? ""}`, stop: true },
    }),
  })
  const scope = createScope({ tags: bundle.tags })
  const ctx = scope.createContext()
  await ctx.resolve(session.session)

  await expect(ctx.exec({
    flow: session.run,
    input: {
      work: { id: "greeter-work", branchId: "main", role: "greeter", policy: "all" },
      input: { prompt: "hi" },
    },
  })).resolves.toMatchObject({
    role: "greeter",
    content: "reply:hi",
    rounds: 1,
  })
  await expect(ctx.exec({
    flow: session.load,
    input: { id: bundle.record.id },
  })).resolves.toBe(bundle.record)
  expect(bundle.store.records.get(bundle.record.id)).toBe(bundle.record)
  expect(validationStub.id).toBe("test")

  await ctx.close()
  await scope.dispose()
})

it("builds minimal session, authority, and model request fixtures", () => {
  expect(testAuthority()).toMatchObject({
    tenant: "test",
    roots: [],
    permissions: [],
    tools: [],
    sandbox: {
      roots: [],
      commands: [],
      write: false,
      network: false,
    },
  })
  const authority = testAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    sandbox: { roots: ["/workspace"] },
  })

  expect(authority).toMatchObject({
    tenant: "tenant-a",
    roots: ["/workspace"],
    permissions: [],
    tools: [],
    sandbox: {
      roots: ["/workspace"],
      commands: [],
      write: false,
      network: false,
    },
  })
  expect(initialRecord("session-a", authority, { nextEventSequence: 4 })).toMatchObject({
    id: "session-a",
    status: "open",
    authorityFingerprint: authority.fingerprint,
    nextEventSequence: 4,
    branches: [{ id: "main", authority }],
  })
  expect(modelRequest({ agentName: "reviewer", round: 2 })).toEqual({
    agentName: "reviewer",
    instructions: "",
    messages: [],
    tools: [],
    skills: [],
    loadedSkills: [],
    subagents: [],
    round: 2,
  })
})
