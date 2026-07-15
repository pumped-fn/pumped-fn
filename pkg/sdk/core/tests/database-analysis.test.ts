import { createScope, flow, resource, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import * as z from "zod"
import type { ModelRequest, ModelResponse } from "../src/index.js"
import * as agent from "../src/agent.js"
import * as session from "../src/session.js"
import * as validation from "../src/validation.js"

interface InspectSchemaInput {
  readonly schema: string
}

interface ExplainQueryInput {
  readonly sql: string
}

interface SchemaInspection {
  readonly tables: readonly string[]
}

interface QueryExplanation {
  readonly plan: string
  readonly applied: false
}

interface DatabaseReadiness {
  readonly serverVersion: string
}

const database = Object.freeze({
  inspect: tag<Lite.Flow<SchemaInspection, InspectSchemaInput>>({ label: "database.inspect" }),
  explain: tag<Lite.Flow<QueryExplanation, ExplainQueryInput>>({ label: "database.explain" }),
  ready: tag<DatabaseReadiness>({ label: "database.ready" }),
})

function initial(authority: session.Authority): session.SessionRecord {
  return Object.freeze({
    id: "database-analysis",
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
    currentBranchId: "main",
    branches: Object.freeze([{
      id: "main",
      version: 0,
      createdBy: "bootstrap",
      authorityFingerprint: authority.fingerprint,
      authority,
      evidence: Object.freeze([]),
    }]),
    work: Object.freeze([]),
    attempts: Object.freeze([]),
    invocations: Object.freeze([]),
    artifacts: Object.freeze([]),
    memory: Object.freeze([]),
    schedules: Object.freeze([]),
    providerContinuations: Object.freeze({}),
    nextEventSequence: 1,
  })
}

describe("database analysis", () => {
  it("adapts scalar models without calling the streaming path", async () => {
    const scalar = flow({
      name: "database.scalar-model",
      parse: typed<ModelRequest>(),
      factory: (ctx) => ({ content: ctx.input.agentName, stop: true }),
    })
    const scope = createScope({ tags: [agent.attempt(agent.fromModel(scalar))] })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: agent.invoke,
      input: {
        agentName: "scalar",
        instructions: "",
        messages: [],
        tools: [],
        skills: [],
        loadedSkills: [],
        subagents: [],
        round: 0,
      },
    })).resolves.toEqual({ content: "scalar", stop: true })

    await ctx.close()
    await scope.dispose()
  })

  it("keeps reserved tool and skill runtime dependencies unoverrideable", async () => {
    const authority = session.createAuthority({
      tenant: "tenant-a",
      roots: ["/workspace"],
      permissions: [],
      tools: ["inspect_schema"],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    })
    const poison = resource({
      name: "database.poison-runtime",
      factory: () => { throw new Error("poison runtime resolved") },
    })
    const inspectSchema = agent.tool({
      name: "inspect_schema",
      version: "1",
      description: "Inspect schema.",
      input: z.object({ schema: z.string() }),
      flow: flow({
        name: "database.reserved-inspect",
        parse: typed<{ schema: string }>(),
        factory: (ctx) => ctx.input.schema,
      }),
      deps: { runtime: poison } as never,
    })
    const guide = agent.skill({
      name: "guide",
      version: "1",
      description: "Guide.",
      content: "safe",
      deps: { runtime: poison } as never,
    })
    const scope = createScope({ tags: [
      session.authority(authority),
      session.record(initial(authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      validation.engine(validation.standard<z.ZodType>({ id: "zod@4", toJsonSchema: (schema) => z.toJSONSchema(schema) })),
    ] })
    const ctx = scope.createContext()
    await ctx.resolve(session.session)

    await expect(ctx.resolve(inspectSchema)).resolves.toMatchObject({ snapshot: { name: "inspect_schema" } })
    await expect(ctx.resolve(guide)).resolves.toMatchObject({ name: "guide" })

    await ctx.close()
    await scope.dispose()
  })

  it("filters cached broad tools before advertising or dispatch", async () => {
    const authority = session.createAuthority({
      tenant: "tenant-a",
      roots: ["/workspace"],
      permissions: ["database:read", "database:write"],
      tools: ["apply_schema", "inspect_schema"],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    })
    const schema = z.object({ schema: z.string() })
    const toolEffects: string[] = []
    const advertised: string[][] = []
    const cachedRole = resource<agent.Role>({
      name: "database.cached-role",
      ownership: "current",
      deps: {
        runtime: session.session,
        engine: tags.required(validation.engine),
        epoch: tags.required(session.current.epoch),
      },
      factory: (_ctx, { runtime, engine, epoch }) => {
        const resolvedTool = (id: string): agent.AnyResolvedTool => {
          const identity = {
            id,
            version: "1",
            schemaDigest: engine.schemaDigest(schema),
            validationEngine: engine.id,
            readiness: "ready",
            flow: `database.cached-${id}`,
          }
          const permit = runtime.tools.permit(identity, runtime.authority, epoch)
          return {
            snapshot: {
              identity,
              name: identity.id,
              description: `${id}.`,
              inputSchema: engine.jsonSchema(schema),
              authorityFingerprint: permit.authorityFingerprint,
              permitEpoch: permit.epoch,
              branchId: "main",
              snapshotEpoch: epoch,
            },
            schema,
            flow: flow({
              name: identity.flow,
              parse: typed<{ schema: string }>(),
              factory: () => { toolEffects.push(id) },
            }),
          }
        }
        return {
          name: "cached",
          version: "1",
          instructions: "",
          maxRounds: 1,
          skills: [],
          subagents: [],
          tools: [resolvedTool("apply_schema"), resolvedTool("inspect_schema")],
        }
      },
    })
    const model = flow({
      name: "database.cached-model",
      parse: typed<ModelRequest>(),
      factory: (ctx) => {
        advertised.push(ctx.input.tools.map((tool) => tool.name))
        return {
          content: "attempt",
          toolCalls: [{ name: "inspect_schema", input: { schema: "public" } }],
          stop: true,
        }
      },
    })
    const execute = session.run({
      name: "database.cached-run",
      turn: agent.turn({ name: "database.cached-turn", role: cachedRole }),
    })
    const scope = createScope({ tags: [
      session.authority(authority),
      session.record(initial(authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      validation.engine(validation.standard<z.ZodType>({ id: "zod@4", toJsonSchema: (value) => z.toJSONSchema(value) })),
      agent.attempt(agent.fromModel(model)),
    ] })
    const ctx = scope.createContext()
    await ctx.resolve(session.session)

    await expect(ctx.exec({
      flow: execute,
      input: {
        work: {
          id: "narrowed",
          branchId: "main",
          role: "cached",
          policy: "all",
          authority: { permissions: ["database:read"], tools: ["inspect_schema"] },
        },
        input: { prompt: "Inspect." },
      },
    })).resolves.toMatchObject({ toolResults: [{ name: "inspect_schema" }] })
    await expect(ctx.exec({
      flow: execute,
      input: {
        work: {
          id: "denied",
          branchId: "main",
          role: "cached",
          policy: "all",
          authority: { permissions: ["database:read"], tools: [] },
        },
        input: { prompt: "Deny." },
      },
    })).rejects.toThrow('tool "inspect_schema" not found')
    expect(advertised).toEqual([["inspect_schema"], []])
    expect(toolEffects).toEqual(["inspect_schema"])

    await ctx.close()
    await scope.dispose()
  })

  it("delivers current queued steering at the model round boundary", async () => {
    const authority = session.createAuthority({
      tenant: "tenant-a",
      roots: ["/workspace"],
      permissions: [],
      tools: [],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    })
    const analyst = agent.role({ name: "steered", version: "1", maxRounds: 2 })
    let modelStarted!: () => void
    const started = new Promise<void>((resolve) => { modelStarted = resolve })
    let releaseModel!: () => void
    const released = new Promise<void>((resolve) => { releaseModel = resolve })
    const model = flow({
      name: "database.steered-model",
      parse: typed<ModelRequest>(),
      factory: async (ctx) => {
        if (ctx.input.round === 0) {
          modelStarted()
          await released
          return { content: "first", stop: true }
        }
        expect(ctx.input.messages).toContainEqual({ role: "user", name: "steering", content: '{"focus":"index"}' })
        return { content: "steered", stop: true }
      },
    })
    const scope = createScope({ tags: [
      session.authority(authority),
      session.record(initial(authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      validation.engine(validation.standard<z.ZodType>({ id: "zod@4", toJsonSchema: (schema) => z.toJSONSchema(schema) })),
      agent.attempt(agent.fromModel(model)),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const active = runtime.work.admit({ id: "steered-work", branchId: "main", role: "steered", policy: "all" })
    const work = runtime.record.work.find((value) => value.id === "steered-work")!
    const branch = runtime.branches.current()
    const running = ctx.exec({
      flow: agent.turn({ name: "database.steered-turn", role: analyst }),
      input: { prompt: "Analyze." },
      tags: [
        session.current.session(runtime),
        session.current.work(work),
        session.current.attempt(active.record),
        session.current.branch(branch),
        session.current.authority(work.authority),
        session.current.epoch(active.record.snapshotEpoch),
      ],
    })
    await started
    runtime.controls.enqueue({
      id: "steer-1",
      workId: work.id,
      attempt: active.record.attempt,
      expectedEpoch: active.record.snapshotEpoch,
      sequence: 1,
      mode: "queue",
      source: "human",
      payload: { focus: "index" },
    })
    releaseModel()
    const result = await running
    expect(result.rounds).toBe(2)
    expect(result.events.some((value) => value.type === "agent_control")).toBe(true)
    runtime.work.settle(work.id, active.record.attempt, { status: "completed" })

    await ctx.close()
    await scope.dispose()
  })

  it("isolates same-tool permits across parallel narrowed work", async () => {
    const authority = session.createAuthority({
      tenant: "tenant-a",
      roots: ["/workspace"],
      permissions: ["database:read", "database:write"],
      tools: ["inspect_schema"],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    })
    const inspectSchema = agent.tool({
      name: "inspect_schema",
      version: "1",
      description: "Inspect schema.",
      input: z.object({ schema: z.string() }),
      flow: flow({
        name: "database.parallel-inspect",
        parse: typed<{ schema: string }>(),
        factory: (ctx) => ctx.input.schema,
      }),
    })
    let resolved = 0
    let release!: () => void
    const both = new Promise<void>((done) => { release = done })
    const snapshot = flow({
      name: "database.parallel-snapshot",
      deps: { tool: inspectSchema },
      factory: async (_ctx, { tool }) => {
        resolved++
        if (resolved === 2) release()
        await both
        return tool.snapshot
      },
    })
    const execute = session.run({ name: "database.parallel-permit", turn: snapshot })
    const scope = createScope({ tags: [
      session.authority(authority),
      session.record(initial(authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      validation.engine(validation.standard<z.ZodType>({ id: "zod@4", toJsonSchema: (schema) => z.toJSONSchema(schema) })),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const [left, right] = await Promise.all([
      ctx.exec({
        flow: execute,
        input: {
          work: {
            id: "read-work",
            branchId: "main",
            role: "reader",
            policy: "all",
            authority: { permissions: ["database:read"] },
          },
          input: undefined,
        },
      }),
      ctx.exec({
        flow: execute,
        input: {
          work: {
            id: "write-work",
            branchId: "main",
            role: "writer",
            policy: "all",
            authority: { permissions: ["database:write"] },
          },
          input: undefined,
        },
      }),
    ])

    expect(left.authorityFingerprint).not.toBe(right.authorityFingerprint)
    expect(runtime.tools.authorize(left.identity, left.permitEpoch, left.authorityFingerprint).authorityFingerprint).toBe(
      left.authorityFingerprint,
    )
    expect(runtime.tools.authorize(right.identity, right.permitEpoch, right.authorityFingerprint).authorityFingerprint).toBe(
      right.authorityFingerprint,
    )
    expect(() => runtime.tools.authorize(left.identity, left.permitEpoch, right.authorityFingerprint)).toThrow("not authorized")

    await ctx.close()
    await scope.dispose()
  })

  it("cancels open invocations when a run stream consumer returns", async () => {
    const authority = session.createAuthority({
      tenant: "tenant-a",
      roots: ["/workspace"],
      permissions: [],
      tools: [],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    })
    const analyst = agent.role({ name: "abandoned", version: "1" })
    const model = flow({
      name: "database.abandoned-model",
      parse: typed<ModelRequest>(),
      factory: () => ({ content: "unused", stop: true }),
    })
    let committed: session.SessionRecord | undefined
    const commit = flow({
      name: "database.abandoned-commit",
      parse: typed<{ record: session.SessionRecord; expectedVersion: number }>(),
      factory: (ctx) => {
        committed = ctx.input.record
        return { version: ctx.input.expectedVersion + 1 }
      },
    })
    const execute = session.run({
      name: "database.abandoned-run",
      turn: agent.turn({ name: "database.abandoned-turn", role: analyst }),
    })
    const scope = createScope({ tags: [
      session.authority(authority),
      session.record(initial(authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      session.store.commit(commit),
      validation.engine(validation.standard<z.ZodType>({ id: "zod@4", toJsonSchema: (schema) => z.toJSONSchema(schema) })),
      agent.attempt(agent.fromModel(model)),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const stream = ctx.execStream({
      flow: execute,
      input: {
        work: { id: "abandoned-work", branchId: "main", role: "abandoned", policy: "all" },
        input: { prompt: "Analyze." },
      },
    })
    const iterator = stream[Symbol.asyncIterator]()
    let event = await iterator.next()
    while (!event.done && event.value.type !== "agent_model_start") event = await iterator.next()
    expect(event.done).toBe(false)
    await iterator.return?.()

    expect(runtime.record.invocations).toMatchObject([{ kind: "model", status: "cancelled" }])
    expect(runtime.record.invocations.some((value) => value.status === "working")).toBe(false)
    await ctx.exec({ flow: session.finish })
    expect(committed?.invocations.some((value) => value.status === "working")).toBe(false)

    await ctx.close()
    await scope.dispose()
  })

  it("fails before model or database effects when readiness is absent", async () => {
    const authority = session.createAuthority({
      tenant: "tenant-a",
      roots: ["/workspace"],
      permissions: ["database:read"],
      tools: ["inspect_schema"],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    })
    let backendCalls = 0
    let modelCalls = 0
    let databaseLeases = 0
    const physicalInspect = flow({
      name: "database.missing-ready-physical-inspect",
      parse: typed<InspectSchemaInput>(),
      factory: () => {
        backendCalls++
        return { tables: ["public.invoices"] }
      },
    })
    const ready = resource({
      name: "database.missing-ready",
      ownership: "current",
      deps: { ready: tags.required(database.ready) },
      factory: (_ctx, { ready }) => ready,
    })
    const inspect = resource({
      name: "database.missing-ready-inspect",
      ownership: "current",
      deps: {
        impl: tags.required(database.inspect),
        ready,
      },
      factory: (ctx, { impl }) => {
        databaseLeases++
        ctx.cleanup(() => { databaseLeases-- })
        return impl
      },
    })
    const inspectSchema = agent.tool({
      name: "inspect_schema",
      version: "1",
      description: "Read the current schema.",
      input: z.object({ schema: z.string() }),
      flow: flow({
        name: "database.missing-ready-inspect-schema",
        parse: typed<InspectSchemaInput>(),
        deps: { inspect },
        factory: (ctx, { inspect }) => inspect.exec({ input: ctx.input }),
      }),
      deps: { ready },
    })
    const analyst = agent.role({
      name: "missing-ready-analyst",
      version: "1",
      tools: { inspectSchema },
    })
    const model = flow({
      name: "database.missing-ready-model",
      parse: typed<ModelRequest>(),
      factory: (): ModelResponse => {
        modelCalls++
        return { content: "unreachable", stop: true }
      },
    })
    const execute = session.run({
      name: "database.missing-ready-run",
      turn: agent.turn({ name: "database.missing-ready-turn", role: analyst }),
    })
    const scope = createScope({ tags: [
      session.authority(authority),
      session.record(initial(authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      database.inspect(physicalInspect),
      validation.engine(validation.standard<z.ZodType>({ id: "zod@4", toJsonSchema: (schema) => z.toJSONSchema(schema) })),
      agent.attempt(agent.fromModel(model)),
    ] })
    const ctx = scope.createContext()
    await ctx.resolve(session.session)

    await expect(ctx.exec({
      flow: execute,
      input: {
        work: { id: "missing-ready", branchId: "main", role: "missing-ready-analyst", policy: "all" },
        input: { prompt: "Inspect public." },
      },
    })).rejects.toThrow()
    expect(modelCalls).toBe(0)
    expect(backendCalls).toBe(0)
    expect(databaseLeases).toBe(0)

    await ctx.close()
    await scope.dispose()
  })

  it("runs parallel read-only roles, joins before merge, and keeps acceptance outside the model", async () => {
    const authority = session.createAuthority({
      tenant: "tenant-a",
      roots: ["/workspace"],
      permissions: ["database:read"],
      tools: ["explain_query", "inspect_schema"],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    })
    let providerActive = 0
    let providerPeak = 0
    let firstRoundStarted = 0
    let releaseFirstRound!: () => void
    const firstRound = new Promise<void>((resolve) => {
      releaseFirstRound = resolve
    })
    let databaseLeases = 0
    let databasePeak = 0
    let backendStarted = 0
    let releaseBackend!: () => void
    const backendsReady = new Promise<void>((resolve) => { releaseBackend = resolve })
    const backendCalls: string[] = []
    const advertised: string[][] = []
    const effectOrder: string[] = []

    const physicalInspect = flow({
      name: "database.physical-inspect",
      parse: typed<InspectSchemaInput>(),
      factory: async (ctx): Promise<SchemaInspection> => {
        backendCalls.push(`inspect:${ctx.input.schema}`)
        backendStarted++
        if (backendStarted === 2) releaseBackend()
        await backendsReady
        return { tables: [`${ctx.input.schema}.invoices`] }
      },
    })
    const physicalExplain = flow({
      name: "database.physical-explain",
      parse: typed<ExplainQueryInput>(),
      factory: async (ctx): Promise<QueryExplanation> => {
        backendCalls.push(`explain:${ctx.input.sql}`)
        backendStarted++
        if (backendStarted === 2) releaseBackend()
        await backendsReady
        return { plan: `index scan:${ctx.input.sql}`, applied: false }
      },
    })
    const ready = resource({
      name: "database.ready",
      ownership: "current",
      deps: { ready: tags.required(database.ready) },
      factory: (_ctx, { ready }) => ready,
    })
    const inspect = resource({
      name: "database.inspect",
      ownership: "current",
      deps: {
        impl: tags.required(database.inspect),
        ready,
      },
      factory: (ctx, { impl, ready }) => {
        expect(ready.serverVersion).toBe("17.5")
        databaseLeases++
        databasePeak = Math.max(databasePeak, databaseLeases)
        ctx.cleanup(() => { databaseLeases-- })
        return impl
      },
    })
    const explain = resource({
      name: "database.explain",
      ownership: "current",
      deps: {
        impl: tags.required(database.explain),
        ready,
      },
      factory: (ctx, { impl, ready }) => {
        expect(ready.serverVersion).toBe("17.5")
        databaseLeases++
        databasePeak = Math.max(databasePeak, databaseLeases)
        ctx.cleanup(() => { databaseLeases-- })
        return impl
      },
    })
    const inspectSchema = agent.tool({
      name: "inspect_schema",
      version: "1",
      description: "Read the current schema.",
      input: z.object({ schema: z.string() }),
      flow: flow({
        name: "database.inspect_schema",
        parse: typed<InspectSchemaInput>(),
        deps: { inspect },
        factory: (ctx, { inspect }) => inspect.exec({ input: ctx.input }),
      }),
      deps: { ready },
    })
    const explainQuery = agent.tool({
      name: "explain_query",
      version: "1",
      description: "Explain a query without applying changes.",
      input: z.object({ sql: z.string() }),
      flow: flow({
        name: "database.explain_query",
        parse: typed<ExplainQueryInput>(),
        deps: { explain },
        factory: (ctx, { explain }) => explain.exec({ input: ctx.input }),
      }),
      deps: { ready },
    })
    const schemaRole = agent.role({
      name: "schema-analyst",
      version: "1",
      instructions: "Inspect schema. Never apply DDL.",
      tools: { inspectSchema },
    })
    const queryRole = agent.role({
      name: "query-analyst",
      version: "1",
      instructions: "Explain queries. Never apply changes.",
      tools: { explainQuery },
    })
    const scripted: agent.Attempt = flow({
      name: "database.scripted-attempt",
      parse: typed<ModelRequest>(),
      factory: async function* (ctx): AsyncGenerator<agent.ModelEvent, ModelResponse, unknown> {
        expect(databaseLeases).toBe(0)
        expect(ctx.input.tools[0]?.inputSchema).toMatchObject({ type: "object" })
        advertised.push(ctx.input.tools.map((tool) => tool.name))
        providerActive++
        providerPeak = Math.max(providerPeak, providerActive)
        try {
          yield { type: "provider_status", status: "working" }
          if (ctx.input.round === 0) {
            firstRoundStarted++
            if (firstRoundStarted === 2) releaseFirstRound()
            await firstRound
            return ctx.input.agentName === "schema-analyst"
              ? { content: "inspect", toolCalls: [{ name: "inspect_schema", input: { schema: "public" } }] }
              : { content: "explain", toolCalls: [{ name: "explain_query", input: { sql: "select * from invoices" } }] }
          }
          return { content: JSON.stringify({ applied: false, role: ctx.input.agentName }), stop: true }
        } finally {
          providerActive--
        }
      },
    })
    const storeCommit: session.Commit = flow({
      name: "database.store.commit",
      parse: typed<{ record: session.SessionRecord; expectedVersion: number }>(),
      factory: (ctx) => {
        effectOrder.push("checkpoint")
        return { version: ctx.input.expectedVersion + 1 }
      },
    })
    const publish: session.PublishArtifact = flow({
      name: "database.artifact.publish",
      parse: typed<session.PublishArtifactInput>(),
      factory: (ctx) => {
        effectOrder.push("artifact")
        return {
          id: "analysis-report",
          version: 1,
          digest: "sha256:report",
          mediaType: ctx.input.mediaType,
          authorityFingerprint: authority.fingerprint,
          workId: ctx.input.workId,
          branchId: ctx.input.branchId,
        }
      },
    })
    const commitMemory: session.CommitMemory = flow({
      name: "database.memory.commit",
      parse: typed<session.CommitMemoryInput>(),
      factory: (ctx) => {
        effectOrder.push("memory.candidate")
        return {
          id: "memory-1",
          version: 1,
          status: "candidate",
          source: "session",
          evidence: ctx.input.evidence,
          authorityFingerprint: authority.fingerprint,
        }
      },
    })
    const acceptMemory: session.AcceptMemory = flow({
      name: "database.memory.accept",
      parse: typed<session.AcceptMemoryInput>(),
      factory: (ctx) => {
        effectOrder.push("memory.accepted")
        return {
          id: ctx.input.id,
          version: 2,
          status: "accepted",
          source: "human",
          evidence: ctx.input.evidence,
          authorityFingerprint: authority.fingerprint,
        }
      },
    })
    const scope = createScope({ tags: [
      session.authority(authority),
      session.record(initial(authority)),
      session.clock({ now: () => "2026-07-14T00:00:00.000Z" }),
      database.inspect(physicalInspect),
      database.explain(physicalExplain),
      database.ready({ serverVersion: "17.5" }),
      session.store.commit(storeCommit),
      session.artifacts.publish(publish),
      session.memory.commit(commitMemory),
      session.memory.accept(acceptMemory),
      validation.engine(validation.standard<z.ZodType>({
        id: "zod@4",
        toJsonSchema: (schema) => z.toJSONSchema(schema),
      })),
      agent.attempt(scripted),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const parent = runtime.work.admit({ id: "parent", branchId: "main", role: "parent", policy: "all" })
    runtime.work.settle("parent", parent.record.attempt, { status: "completed" })
    const left = await ctx.exec({
      flow: session.fork,
      input: { id: "schema", parentId: "main", workId: "parent", authority: { tools: ["inspect_schema"] } },
    })
    const right = await ctx.exec({
      flow: session.fork,
      input: { id: "query", parentId: "main", workId: "parent", authority: { tools: ["explain_query"] } },
    })
    const analyzeSchema = session.run({ name: "database.schema", turn: agent.turn({ name: "database.schema.turn", role: schemaRole }) })
    const analyzeQuery = session.run({ name: "database.query", turn: agent.turn({ name: "database.query.turn", role: queryRole }) })
    const schemaResult = ctx.exec({
      flow: analyzeSchema,
      input: {
        work: { id: "schema-work", branchId: left.id, role: "schema-analyst", policy: "all", authority: { tools: ["inspect_schema"] } },
        input: { prompt: "Inspect public." },
      },
    })
    const queryResult = ctx.exec({
      flow: analyzeQuery,
      input: {
        work: { id: "query-work", branchId: right.id, role: "query-analyst", policy: "all", authority: { tools: ["explain_query"] } },
        input: { prompt: "Optimize invoices." },
      },
    })
    const [schemaOutput, queryOutput] = await Promise.all([schemaResult, queryResult])

    expect(providerPeak).toBe(2)
    expect(databaseLeases).toBe(0)
    expect(databasePeak).toBe(2)
    expect([...backendCalls].sort()).toEqual([
      "inspect:public",
      "explain:select * from invoices",
    ].sort())
    expect(advertised.flat().every((name) => name === "inspect_schema" || name === "explain_query")).toBe(true)
    expect(schemaOutput.toolResults).toHaveLength(1)
    expect(queryOutput.toolResults).toHaveLength(1)
    expect(JSON.parse(schemaOutput.content)).toMatchObject({ applied: false })
    expect(JSON.parse(queryOutput.content)).toMatchObject({ applied: false })
    expect(runtime.record.invocations.filter((value) => value.kind === "model")).toHaveLength(4)
    expect(runtime.record.invocations.filter((value) => value.kind === "tool")).toHaveLength(2)
    expect(runtime.record.invocations.every((value) => value.status === "completed")).toBe(true)
    expect(schemaOutput.events.some((value) => value.type === "model.provider_status")).toBe(true)
    expect(queryOutput.events.some((value) => value.type === "model.provider_status")).toBe(true)
    const lifecycle = [...runtime.eventsFor("schema-work"), ...runtime.eventsFor("query-work")]
    expect(lifecycle.some((value) => value.type === "agent_tool_start" && value.invocationId && value.targetName)).toBe(true)
    expect(new Set(lifecycle.map((value) => value.sequence)).size).toBe(lifecycle.length)
    await expect(ctx.exec({
      flow: session.join,
      input: { workIds: ["schema-work", "query-work"], policy: "all" },
    })).resolves.toEqual([{ status: "completed" }, { status: "completed" }])
    const merged = await ctx.exec({
      flow: session.merge,
      input: { targetId: "main", sourceIds: [left.id, right.id], workId: "parent", expectedTargetVersion: 0 },
    })
    expect(merged.version).toBe(1)

    const artifact = await ctx.exec({
      flow: session.publishArtifact,
      input: {
        workId: "parent",
        branchId: "main",
        mediaType: "application/json",
        content: new TextEncoder().encode(JSON.stringify({ applied: false })),
      },
    })
    const candidate = await ctx.exec({
      flow: session.commitMemory,
      input: {
        workId: "parent",
        branchId: "main",
        value: { applied: false },
        evidence: [{ id: artifact.id, kind: "artifact", digest: artifact.digest }],
      },
    })
    expect(candidate.status).toBe("candidate")
    const accepted = await ctx.exec({
      flow: session.acceptMemory,
      input: { id: candidate.id, workId: "parent", evidence: candidate.evidence },
    })
    expect(accepted).toMatchObject({ status: "accepted", source: "human" })
    expect(runtime.record.artifacts).toEqual([artifact])
    expect(runtime.record.memory).toEqual([accepted])
    await ctx.exec({ flow: session.finish })

    expect(effectOrder).toEqual(["artifact", "memory.candidate", "memory.accepted", "checkpoint"])
    await ctx.close()
    await scope.dispose()
  })
})
