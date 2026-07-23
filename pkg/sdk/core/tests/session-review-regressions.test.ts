import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import * as sandbox from "../src/sandbox.js"
import {
  acceptMemory,
  authority,
  clock,
  commitMemory,
  createAuthority,
  current,
  execution,
  fork,
  loadAndBind,
  memory,
  merge,
  record,
  run,
  scheduler,
  session,
  store,
  wait,
  wake,
  type Authority,
  type AcceptMemoryInput,
  type CommitMemoryInput,
  type SessionRecord,
  type SessionRuntime,
  type Wake,
} from "../src/session.js"

function initial(bound: Authority): SessionRecord {
  return Object.freeze({
    id: "session-review",
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: bound.fingerprint,
    authorityConstraints: bound,
    currentBranchId: "main",
    branches: Object.freeze([{
      id: "main",
      version: 0,
      createdBy: "bootstrap",
      authorityFingerprint: bound.fingerprint,
      authority: bound,
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

function authorityValue(permissions: readonly string[] = []): Authority {
  return createAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    permissions,
    tools: [],
    sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
  })
}

const fixedClock = { now: () => "2026-07-14T00:00:00.000Z" }

describe("session review regressions", () => {
  it("rejects malformed persisted record scalars before binding a runtime", async () => {
    const bound = authorityValue()
    let stored: SessionRecord = initial(bound)
    const load = flow({
      name: "review.invalid-record.load",
      parse: typed<{ id: string }>(),
      factory: () => stored,
    })
    const scope = createScope({ tags: [store.load(load)] })
    const ctx = scope.createContext()
    const root = initial(bound).branches[0]!
    const work = {
      id: "work",
      branchId: "main",
      role: "review",
      status: "completed" as const,
      policy: "all" as const,
      attempt: 1,
      authority: bound,
    }
    const attempt = {
      workId: "work",
      attempt: 1,
      snapshotEpoch: 1,
      status: "completed" as const,
      startedAt: fixedClock.now(),
      settledAt: fixedClock.now(),
    }
    const cases = [
      {
        value: { ...initial(bound), schemaVersion: 2 },
        message: "Session schema version 2 is unsupported",
      },
      {
        value: { ...initial(bound), status: "paused" },
        message: "Session status is invalid",
      },
      {
        value: { ...initial(bound), status: "finishing" },
        message: "Persisted session cannot be finishing",
      },
      {
        value: { ...initial(bound), version: Number.MAX_SAFE_INTEGER + 1 },
        message: "Session version must be a safe integer",
      },
      {
        value: { ...initial(bound), branches: [{ ...root, version: -1 }] },
        message: "Branch main version must be a safe integer",
      },
      {
        value: { ...initial(bound), providerContinuations: { codex: 1 } },
        message: "Session provider continuation codex must be a string",
      },
      {
        value: { ...initial(bound), work: [{ ...work, status: "paused" }] },
        message: "Work work status is invalid",
      },
      {
        value: {
          ...initial(bound),
          work: [{ ...work, status: "ready" }],
          schedules: [{
            id: "stale-ready",
            workId: "work",
            dueAt: "2026-07-15T00:00:00.000Z",
            priority: 1,
            expectedSessionVersion: 0,
          }],
        },
        message: "Ready work work cannot have a schedule",
      },
      {
        value: {
          ...initial(bound),
          work: [{ ...work, status: "working" }],
          attempts: [{ ...attempt, status: "working", settledAt: undefined }],
        },
        message: "Persisted work work cannot be working",
      },
      {
        value: {
          ...initial(bound),
          status: "finished",
          work: [{ ...work, status: "waiting" }],
          attempts: [{ ...attempt, status: "waiting" }],
          schedules: [{
            id: "unfinished",
            workId: "work",
            dueAt: "2026-07-15T00:00:00.000Z",
            priority: 1,
            expectedSessionVersion: 0,
          }],
        },
        message: "Finished session cannot contain waiting work work",
      },
      ...(["working", "quarantined"] as const).map((status) => ({
        value: {
          ...initial(bound),
          status: "finished",
          work: [work],
          attempts: [attempt],
          invocations: [{
            id: `${status}-invocation`,
            workId: "work",
            attempt: 1,
            kind: "model" as const,
            status,
            idempotencyKey: `${status}-effect`,
          }],
        },
        message: `Finished session cannot contain ${status} invocation ${status}-invocation`,
      })),
      {
        value: { ...initial(bound), work: [work], attempts: [{ ...attempt, settledAt: undefined }] },
        message: "Attempt work:1 completed status must be settled",
      },
    ]

    for (const value of cases) {
      stored = value.value as SessionRecord
      await expect(ctx.exec({
        flow: loadAndBind,
        input: { id: stored.id, authority: bound },
      })).rejects.toThrow(value.message)
    }

    await ctx.close()
    await scope.dispose()
  })

  it("canonicalizes sandbox paths before invoking adapters", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumped-sdk-sandbox-"))
    const outside = await mkdtemp(join(tmpdir(), "pumped-sdk-outside-"))
    try {
      await mkdir(join(root, "real"))
      await writeFile(join(root, "real", "input.txt"), "ready")
      await writeFile(join(outside, "secret.txt"), "secret")
      await symlink(join(root, "real"), join(root, "alias"))
      await symlink(outside, join(root, "leak"))
      const bound = createAuthority({
        tenant: "tenant-a",
        roots: [root],
        permissions: [],
        tools: [],
        sandbox: { roots: [root], commands: [], write: true, network: false },
      })
      let reads = 0
      let writes = 0
      const read = flow({
        name: "review.sandbox.read",
        parse: typed<sandbox.ReadInput>(),
        factory: (ctx) => {
          reads++
          return readFile(ctx.input.path, "utf8")
        },
      })
      const write = flow({
        name: "review.sandbox.write",
        parse: typed<sandbox.WriteInput>(),
        factory: async (ctx) => {
          writes++
          await mkdir(dirname(ctx.input.path), { recursive: true })
          await writeFile(ctx.input.path, ctx.input.content)
        },
      })
      const scope = createScope({ tags: [
        authority(bound),
        record(initial(bound)),
        clock(fixedClock),
        sandbox.policy({
          roots: [root],
          write: true,
          network: false,
          commands: [],
          timeoutMs: 1_000,
          maxOutputBytes: 1_024,
        }),
        sandbox.impl.read(read),
        sandbox.impl.write(write),
      ] })
      const ctx = scope.createContext()

      await expect(ctx.exec({
        flow: sandbox.read,
        input: { path: join(root, "alias", "input.txt") },
      })).resolves.toBe("ready")
      await expect(ctx.exec({
        flow: sandbox.write,
        input: { path: join(root, "alias", "output.txt"), content: "written" },
      })).resolves.toBeUndefined()
      await expect(readFile(join(root, "real", "output.txt"), "utf8")).resolves.toBe("written")
      await expect(ctx.exec({
        flow: sandbox.write,
        input: { path: join(root, "new", "deep", "output.txt"), content: "created" },
      })).resolves.toBeUndefined()
      await expect(readFile(join(root, "new", "deep", "output.txt"), "utf8")).resolves.toBe("created")
      await expect(ctx.exec({
        flow: sandbox.read,
        input: { path: join(root, "leak", "secret.txt") },
      })).rejects.toBeInstanceOf(sandbox.PolicyError)
      await expect(ctx.exec({
        flow: sandbox.write,
        input: { path: join(root, "leak", "output.txt"), content: "blocked" },
      })).rejects.toBeInstanceOf(sandbox.PolicyError)
      expect(reads).toBe(1)
      expect(writes).toBe(2)

      await ctx.close()
      await scope.dispose()
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("rejects invalid merge inputs without changing branch state", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const parent = runtime.work.admit({ id: "parent", branchId: "main", role: "review", policy: "all" })
    runtime.work.settle(parent.record.workId, parent.record.attempt, { status: "completed" })
    const child = runtime.branches.fork({ id: "child", parentId: "main", workId: "parent", authority: {} })
    const childWork = runtime.work.admit({ id: "child-work", branchId: child.id, role: "review", policy: "all" })
    runtime.work.settle(childWork.record.workId, childWork.record.attempt, { status: "completed" })
    const before = runtime.record

    expect(() => runtime.merge({
      targetId: "main",
      sourceIds: [],
      workId: "parent",
      expectedTargetVersion: 0,
    })).toThrow("at least one source branch")
    expect(runtime.record).toBe(before)
    expect(() => runtime.merge({
      targetId: "main",
      sourceIds: ["child", "child"],
      workId: "parent",
      expectedTargetVersion: 0,
    })).toThrow("source branches must be unique")
    expect(runtime.record).toBe(before)
    expect(() => runtime.merge({
      targetId: "main",
      sourceIds: ["child"],
      workId: "missing",
      expectedTargetVersion: 0,
    })).toThrow("Work missing does not exist")
    expect(runtime.record).toBe(before)
    expect(runtime.branches.current().version).toBe(0)

    await ctx.close()
    await scope.dispose()
  })

  it("does not finish or commit while recoverable work is waiting", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    runtime.park({
      work: { id: "waiting", branchId: "main", role: "review", policy: "all" },
      intent: {
        id: "waiting-schedule",
        dueAt: "2026-07-15T00:00:00.000Z",
        priority: 1,
        expectedSessionVersion: 0,
      },
    })
    const before = runtime.record
    let commits = 0

    await expect(runtime.finishWith(async (_record, expectedVersion) => {
      commits++
      return expectedVersion + 1
    })).rejects.toThrow("Work waiting is still waiting")
    expect(commits).toBe(0)
    expect(runtime.status).toBe("open")
    expect(runtime.record).toBe(before)

    await ctx.close()
    await scope.dispose()
  })

  it("lets active invocation cleanup settle while finish drains work", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({ id: "finishing-work", branchId: "main", role: "review", policy: "all" })
    runtime.invocations.start({
      id: "finishing-invocation",
      workId: active.record.workId,
      attempt: active.record.attempt,
      kind: "model",
      idempotencyKey: "finishing-effect",
    })
    active.signal.addEventListener("abort", () => {
      runtime.invocations.settle("finishing-invocation", "cancelled")
      runtime.work.settle(active.record.workId, active.record.attempt, { status: "cancelled" })
    }, { once: true })

    await expect(runtime.finishWith(async (_record, expectedVersion) => expectedVersion + 1)).resolves.toMatchObject({
      status: "finished",
      work: [{ id: "finishing-work", status: "cancelled" }],
      invocations: [{ id: "finishing-invocation", status: "cancelled" }],
    })

    await ctx.close()
    await scope.dispose()
  })

  it("lets active invocation cleanup settle while deactivation drains work", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({ id: "deactivating-work", branchId: "main", role: "review", policy: "all" })
    runtime.invocations.start({
      id: "deactivating-invocation",
      workId: active.record.workId,
      attempt: active.record.attempt,
      kind: "adapter",
      idempotencyKey: "deactivating-effect",
    })
    active.signal.addEventListener("abort", () => {
      runtime.invocations.settle("deactivating-invocation", "cancelled")
      runtime.work.settle(active.record.workId, active.record.attempt, { status: "cancelled" })
    }, { once: true })

    await runtime.deactivate()
    expect(runtime.record).toMatchObject({
      work: [{ id: "deactivating-work", status: "cancelled" }],
      invocations: [{ id: "deactivating-invocation", status: "cancelled" }],
    })
    const before = runtime.record
    expect(() => runtime.invocations.settle("deactivating-invocation", "failed")).toThrow(
      "Session activation is deactivated",
    )
    expect(runtime.record).toBe(before)

    await ctx.close()
    await scope.dispose()
  })

  it("produces a finished record that reloads as terminal", async () => {
    const bound = authorityValue()
    let persisted = initial(bound)
    const load = flow({
      name: "review.finished-record.load",
      parse: typed<{ id: string }>(),
      factory: () => persisted,
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      store.load(load),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({ id: "finished-work", branchId: "main", role: "review", policy: "all" })
    runtime.invocations.start({
      id: "finished-invocation",
      workId: active.record.workId,
      attempt: active.record.attempt,
      kind: "model",
      idempotencyKey: "finished-effect",
    })
    runtime.invocations.settle("finished-invocation", "completed")
    runtime.work.settle(active.record.workId, active.record.attempt, { status: "completed" })
    persisted = await runtime.finishWith(async (_record, expectedVersion) => expectedVersion + 1)
    await ctx.close()

    const loader = scope.createContext()
    const bindings = await loader.exec({
      flow: loadAndBind,
      input: { id: persisted.id, authority: bound },
    })
    expect(bindings.record).toMatchObject({
      status: "finished",
      version: 1,
      work: [{ id: "finished-work", status: "completed" }],
      schedules: [],
    })
    await loader.close()
    const resumed = scope.createContext({ tags: bindings.tags })
    const terminal = await resumed.resolve(session)
    const before = terminal.record

    expect(terminal.status).toBe("finished")
    expect(() => terminal.invocations.settle("finished-invocation", "failed")).toThrow(
      "Session session-review is finished",
    )
    expect(terminal.record).toBe(before)

    await resumed.close()
    await scope.dispose()
  })

  it("keeps terminal completion and event mutation behind the committed finish path", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const open = runtime.record

    expect(() => runtime.completeFinish(1)).toThrow("Session completion is not authorized")
    expect(runtime.record).toBe(open)

    await runtime.beginFinish()
    const finishing = runtime.record
    expect(() => runtime.completeFinish(1)).toThrow("Session completion is not authorized")
    expect(runtime.record).toBe(finishing)

    let commits = 0
    const finished = await runtime.finishWith(async (_record, expectedVersion) => {
      commits++
      return expectedVersion + 1
    })
    expect(commits).toBe(1)
    expect(finished).toMatchObject({ status: "finished", version: 1 })

    const terminal = runtime.record
    expect(() => runtime.emit({
      workId: "late",
      attempt: 1,
      branchId: "main",
      snapshotEpoch: terminal.nextEventSequence,
      type: "late",
    })).toThrow("Session session-review is finished")
    expect(runtime.record).toBe(terminal)

    await ctx.close()
    await scope.dispose()
  })

  it("binds tool permits to contained authority", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const identity = {
      id: "tool",
      version: "1",
      schemaDigest: "schema",
      validationEngine: "validator",
      readiness: "ready",
      flow: "tool.flow",
    }
    const broader = createAuthority({
      tenant: "tenant-a",
      roots: ["/"],
      permissions: [],
      tools: [],
      sandbox: { roots: ["/"], commands: [], write: false, network: false },
    })

    expect(() => runtime.tools.permit(identity, broader)).toThrow("Tool permit authority exceeds its parent")

    await ctx.close()
    await scope.dispose()
  })

  it("fences lifecycle mutators during deactivation", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)

    await runtime.deactivate()
    expect(() => runtime.tools.revoke(1)).toThrow("Session activation is deactivated")
    expect(() => runtime.controls.fence("work", 1, 1)).toThrow("Session activation is deactivated")

    await ctx.close()
    await scope.dispose()
  })

  it("rejects events with invalid work, attempt, branch, or invocation lineage", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({ id: "work", branchId: "main", role: "review", policy: "all" })
    const event = {
      workId: "work",
      attempt: active.record.attempt,
      branchId: "main",
      snapshotEpoch: active.record.snapshotEpoch,
      type: "work.observed",
    }

    expect(() => runtime.emit({ ...event, workId: "missing" })).toThrow("Work missing does not exist")
    expect(() => runtime.emit({ ...event, branchId: "missing" })).toThrow("Branch missing does not exist")
    expect(() => runtime.emit({ ...event, attempt: 2 })).toThrow("Attempt work:2 is not current")
    expect(() => runtime.emit({ ...event, snapshotEpoch: active.record.snapshotEpoch + 1 })).toThrow(
      "Attempt work:1 snapshot epoch does not match",
    )
    expect(() => runtime.emit({ ...event, invocationId: "missing" })).toThrow(
      "Invocation missing does not belong to attempt work:1",
    )

    runtime.work.settle("work", active.record.attempt, { status: "completed" })
    await ctx.close()
    await scope.dispose()
  })

  it("rejects invocation lineage on unbound events", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)

    expect(runtime.emit({
      workId: "unbound",
      attempt: 0,
      branchId: "main",
      snapshotEpoch: 0,
      type: "agent_role_start",
    })).toMatchObject({ workId: "unbound", attempt: 0 })
    expect(() => runtime.emit({
      workId: "unbound",
      attempt: 0,
      branchId: "main",
      snapshotEpoch: 0,
      type: "agent_model_start",
      invocationId: "ghost",
    })).toThrow("Unbound events cannot reference an invocation")

    await ctx.close()
    await scope.dispose()
  })

  it("allows a failed finish commit to retry and enforces sequential versions", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)

    await expect(runtime.finishWith(async () => {
      throw new Error("commit failed")
    })).rejects.toThrow("commit failed")
    expect(runtime.status).toBe("open")
    await expect(runtime.finishWith(async () => 4)).rejects.toThrow("Session completion version must increase by one")
    expect(runtime.status).toBe("open")
    await expect(runtime.finishWith(async (_record, expectedVersion) => expectedVersion + 1)).resolves.toMatchObject({
      status: "finished",
      version: 1,
    })

    await ctx.close()
    await scope.dispose()
  })

  it("does not let terminal mutators overwrite an abandoned session", async () => {
    const bound = authorityValue()
    const abandoned = Object.freeze({ ...initial(bound), status: "abandoned" as const })
    const scope = createScope({ tags: [authority(bound), record(abandoned), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)

    expect(() => runtime.completeFinish(1)).toThrow("Session completion is not authorized")
    expect(() => runtime.emit({
      workId: "late",
      attempt: 1,
      branchId: "main",
      snapshotEpoch: runtime.record.nextEventSequence,
      type: "late",
    })).toThrow("Session session-review is abandoned")
    await expect(runtime.finishWith(async (_record, expectedVersion) => expectedVersion + 1)).rejects.toThrow(
      "Session session-review is abandoned",
    )
    expect(runtime.status).toBe("abandoned")
    expect(runtime.record).toStrictEqual(abandoned)

    await ctx.close()
    await scope.dispose()
  })

  it("keeps child work within its parent work authority and branch", async () => {
    const bound = authorityValue(["database:read", "database:write"])
    const inspect = flow({
      name: "review.authority-lineage.inspect",
      deps: { authority: tags.required(current.authority) },
      factory: (_ctx, { authority }) => authority.permissions,
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      execution.turn({ flow: inspect }),
    ] })
    const ctx = scope.createContext()
    await ctx.resolve(session)

    await expect(ctx.exec({
      flow: run,
      input: {
        work: {
          id: "parent",
          branchId: "main",
          role: "review",
          policy: "all",
          authority: { permissions: ["database:read"] },
        },
        input: undefined,
      },
    })).resolves.toEqual(["database:read"])
    await expect(ctx.exec({
      flow: run,
      input: {
        work: { id: "child", parentId: "parent", branchId: "main", role: "review", policy: "all" },
        input: undefined,
      },
    })).resolves.toEqual(["database:read"])
    await expect(ctx.exec({
      flow: run,
      input: {
        work: {
          id: "wider-child",
          parentId: "parent",
          branchId: "main",
          role: "review",
          policy: "all",
          authority: { permissions: ["database:write"] },
        },
        input: undefined,
      },
    })).rejects.toThrow("Authority constraint expands permissions")

    const childBranch = await ctx.exec({
      flow: fork,
      input: { id: "child-branch", parentId: "main", workId: "parent", authority: {} },
    })
    await expect(ctx.exec({
      flow: run,
      input: {
        work: {
          id: "foreign-branch-child",
          parentId: "parent",
          branchId: childBranch.id,
          role: "review",
          policy: "all",
        },
        input: undefined,
      },
    })).rejects.toThrow("Work parent is not on branch child-branch")

    await ctx.close()
    await scope.dispose()
  })

  it("binds branch forks to an existing creator on the source branch", async () => {
    const bound = authorityValue(["database:read", "database:write"])
    const inspect = flow({
      name: "review.branch-lineage.inspect",
      deps: { authority: tags.required(current.authority) },
      factory: (_ctx, { authority }) => authority.permissions,
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      execution.turn({ flow: inspect }),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)

    await ctx.exec({
      flow: run,
      input: {
        work: {
          id: "creator",
          branchId: "main",
          role: "review",
          policy: "all",
          authority: { permissions: ["database:read"] },
        },
        input: undefined,
      },
    })
    await expect(ctx.exec({
      flow: fork,
      input: { id: "unknown-creator", parentId: "main", workId: "unknown", authority: {} },
    })).rejects.toThrow("Work unknown does not exist")
    await expect(ctx.exec({
      flow: fork,
      input: {
        id: "wider-branch",
        parentId: "main",
        workId: "creator",
        authority: { permissions: ["database:write"] },
      },
    })).rejects.toThrow("Authority constraint expands permissions")

    const childBranch = await ctx.exec({
      flow: fork,
      input: { id: "creator-child", parentId: "main", workId: "creator", authority: {} },
    })
    expect(childBranch.authority.permissions).toEqual(["database:read"])
    await ctx.exec({
      flow: run,
      input: {
        work: { id: "other-branch-work", branchId: childBranch.id, role: "review", policy: "all" },
        input: undefined,
      },
    })
    await expect(ctx.exec({
      flow: fork,
      input: { id: "unrelated-creator", parentId: "main", workId: "other-branch-work", authority: {} },
    })).rejects.toThrow("Work other-branch-work is not on branch main")
    expect("record" in runtime.branches).toBe(false)

    const main = runtime.branches.current()
    const merged = await ctx.exec({
      flow: merge,
      input: {
        targetId: main.id,
        sourceIds: [childBranch.id],
        workId: "creator",
        expectedTargetVersion: main.version,
      },
    })
    expect(merged).toMatchObject({
      id: main.id,
      createdBy: main.createdBy,
      authorityFingerprint: main.authorityFingerprint,
      version: main.version + 1,
    })
    expect(Object.hasOwn(merged, "parentId")).toBe(Object.hasOwn(main, "parentId"))
    expect(merged.authority).toBe(main.authority)

    await ctx.close()
    await scope.dispose()
  })

  it("checks cancellation after work.started before entering the turn", async () => {
    const bound = authorityValue()
    let effects = 0
    const turn = flow({
      name: "review.cancel-safe-point.turn",
      factory: () => {
        effects++
        return "effect"
      },
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      execution.turn({ flow: turn }),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const stream = ctx.execStream({
      flow: run,
      input: {
        work: { id: "cancelled", branchId: "main", role: "review", policy: "all" },
        input: undefined,
      },
    })
    const iterator = stream[Symbol.asyncIterator]()
    const started = await iterator.next()
    const result = stream.result.catch((error: unknown) => error)
    const attempt = runtime.record.attempts.find((value) => value.workId === "cancelled")!
    const cancellation = { reason: "stop" }

    expect(started).toMatchObject({ done: false, value: { type: "work.started" } })
    runtime.controls.enqueue({
      id: "cancel-after-start",
      workId: "cancelled",
      attempt: attempt.attempt,
      expectedEpoch: attempt.snapshotEpoch,
      sequence: 1,
      mode: "cancel",
      source: "human",
      payload: cancellation,
    })

    await expect(iterator.next()).rejects.toBe(cancellation)
    await expect(result).resolves.toBe(cancellation)
    expect(effects).toBe(0)
    expect(runtime.record.work.find((value) => value.id === "cancelled")?.status).toBe("cancelled")

    await ctx.close()
    await scope.dispose()
  })

  it("does not deliver steering from an earlier attempt after resume", async () => {
    const bound = authorityValue()
    let runtime!: SessionRuntime
    const wakeImpl: Wake = flow({
      name: "review.scheduler.wake",
      parse: typed<{ id: string }>(),
      factory: () => {
        const work = runtime.record.work.find((value) => value.id === "resumed")!
        return Object.freeze({ ...work, status: "ready" as const, attempt: work.attempt + 1 })
      },
    })
    const inspect = flow({
      name: "review.steering-fence.turn",
      deps: {
        runtime: tags.required(current.session),
        work: tags.required(current.work),
      },
      factory: (_ctx, { runtime, work }) => runtime.controls.drain(work.id, -1).map((value) => value.id),
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      execution.turn({ flow: inspect }),
      scheduler.wake(wakeImpl),
    ] })
    const ctx = scope.createContext()
    runtime = await ctx.resolve(session)
    await ctx.exec({
      flow: wait,
      input: {
        work: { id: "resumed", branchId: "main", role: "review", policy: "all" },
        intent: {
          id: "resume-work",
          dueAt: "2026-07-15T00:00:00.000Z",
          priority: 1,
          expectedSessionVersion: 0,
        },
      },
    })
    const first = runtime.record.attempts.find((value) => value.workId === "resumed")!
    runtime.controls.enqueue({
      id: "attempt-one-steering",
      workId: "resumed",
      attempt: first.attempt,
      expectedEpoch: first.snapshotEpoch,
      sequence: 1,
      mode: "input",
      source: "human",
      payload: { focus: "stale" },
    })
    expect(runtime.controls.drain("resumed", -1)).toHaveLength(1)

    await ctx.exec({ flow: wake, input: { id: "resume-work" } })
    await expect(ctx.exec({
      flow: run,
      input: {
        work: { id: "resumed", branchId: "main", role: "review", policy: "all" },
        input: undefined,
      },
    })).resolves.toEqual([])
    expect(runtime.controls.drain("resumed", -1)).toEqual([])
    expect(runtime.record.attempts.map((value) => value.attempt)).toEqual([1, 2])

    await ctx.close()
    await scope.dispose()
  })

  it("rejects duplicate schedule IDs before admitting another work item", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const intent = {
      id: "one-intent",
      dueAt: "2026-07-15T00:00:00.000Z",
      priority: 1,
      expectedSessionVersion: 0,
    }
    await ctx.exec({
      flow: wait,
      input: {
        work: { id: "first", branchId: "main", role: "review", policy: "all" },
        intent,
      },
    })

    await expect(ctx.exec({
      flow: wait,
      input: {
        work: { id: "orphan", branchId: "main", role: "review", policy: "all" },
        intent,
      },
    })).rejects.toThrow("Schedule one-intent already exists")
    expect(runtime.record.schedules).toHaveLength(1)
    expect(runtime.record.work).toMatchObject([{ id: "first", status: "waiting" }])
    expect(runtime.record.work.some((value) => value.id === "orphan")).toBe(false)

    await ctx.close()
    await scope.dispose()
  })

  it("keeps invocation settlement terminal", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    expect(() => runtime.invocations.start({
      id: "missing",
      workId: "missing",
      attempt: 1,
      kind: "model",
      idempotencyKey: "missing",
    })).toThrow("Work missing does not exist")

    const active = runtime.work.admit({ id: "work", branchId: "main", role: "review", policy: "all" })
    expect(() => runtime.invocations.start({
      id: "stale",
      workId: "work",
      attempt: active.record.attempt + 1,
      kind: "model",
      idempotencyKey: "stale",
    })).toThrow("Attempt work:2 is not active")
    runtime.invocations.start({
      id: "terminal",
      workId: "work",
      attempt: active.record.attempt,
      kind: "model",
      idempotencyKey: "terminal",
    })
    expect(() => runtime.invocations.start({
      id: "duplicate-effect",
      workId: "work",
      attempt: active.record.attempt,
      kind: "tool",
      idempotencyKey: "terminal",
    })).toThrow("Invocation idempotency key terminal already exists")

    runtime.invocations.settle("terminal", "completed")
    expect(() => runtime.invocations.settle("terminal", "failed")).toThrow(
      "Invocation terminal is already completed",
    )
    expect(runtime.record.invocations).toMatchObject([{ id: "terminal", status: "completed" }])
    runtime.work.settle("work", active.record.attempt, { status: "completed" })

    await ctx.close()
    await scope.dispose()
  })

  it("rejects finish while an invocation is working and permits it after settlement", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({ id: "work", branchId: "main", role: "review", policy: "all" })
    runtime.invocations.start({
      id: "model-call",
      workId: "work",
      attempt: active.record.attempt,
      kind: "model",
      idempotencyKey: "model-call",
    })
    runtime.work.settle("work", active.record.attempt, { status: "completed" })
    let commits = 0

    await expect(runtime.finishWith(async (_record, expectedVersion) => {
      commits++
      return expectedVersion + 1
    })).rejects.toThrow("Invocation model-call is still working")
    expect(commits).toBe(0)
    expect(runtime.status).toBe("open")

    runtime.invocations.settle("model-call", "completed")
    await expect(runtime.finishWith(async (_record, expectedVersion) => {
      commits++
      return expectedVersion + 1
    })).resolves.toMatchObject({ status: "finished", version: 1 })
    expect(commits).toBe(1)

    await ctx.close()
    await scope.dispose()
  })

  it("keeps a quarantined remote invocation as a finish fence", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({ id: "work", branchId: "main", role: "review", policy: "all" })
    runtime.invocations.start({
      id: "remote",
      workId: "work",
      attempt: active.record.attempt,
      kind: "adapter",
      idempotencyKey: "remote",
    })
    runtime.invocations.settle("remote", "quarantined")
    runtime.work.settle("work", active.record.attempt, { status: "failed" })

    await expect(runtime.finishWith(async (_record, expectedVersion) => expectedVersion + 1)).rejects.toThrow(
      "Invocation remote is still quarantined",
    )

    await ctx.close()
    await scope.dispose()
  })

  it("binds memory transitions to status, source, authority, and normalized evidence", async () => {
    const bound = authorityValue()
    const commit = flow({
      name: "review.memory.commit-binding",
      parse: typed<CommitMemoryInput>(),
      factory: (ctx) => ({
        id: String(ctx.input.value),
        version: 1,
        status: ctx.input.value === "wrong-status" ? "accepted" as const : "candidate" as const,
        source: ctx.input.value === "wrong-source" ? "import" as const : "session" as const,
        evidence: ctx.input.value === "wrong-evidence" ? [] : ctx.input.evidence,
        authorityFingerprint: bound.fingerprint,
      }),
    })
    const accept = flow({
      name: "review.memory.accept-binding",
      parse: typed<AcceptMemoryInput>(),
      factory: (ctx) => ({
        id: ctx.input.id,
        version: 2,
        status: "accepted" as const,
        source: ctx.input.id === "wrong-accept-source" ? "session" as const : "policy" as const,
        evidence: ctx.input.id === "wrong-accept-evidence" ? [] : ctx.input.evidence,
        authorityFingerprint: bound.fingerprint,
      }),
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      memory.commit(commit),
      memory.accept(accept),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({ id: "work", branchId: "main", role: "review", policy: "all" })
    const evidence = [{ id: "e\u0301", kind: "artifact", digest: "d\u0301" }]
    const commitInput = (value: string): CommitMemoryInput => ({
      workId: "work",
      branchId: "main",
      value,
      evidence,
    })

    for (const value of ["wrong-status", "wrong-source", "wrong-evidence"]) {
      await expect(ctx.exec({ flow: commitMemory, input: commitInput(value) })).rejects.toThrow("memory.commit boundary")
    }
    for (const value of ["wrong-accept-source", "wrong-accept-evidence", "valid"]) {
      await expect(ctx.exec({ flow: commitMemory, input: commitInput(value) })).resolves.toMatchObject({
        id: value,
        evidence: [{ id: "é", kind: "artifact", digest: "d́" }],
      })
    }
    expect("memory" in runtime).toBe(false)
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "wrong-accept-source", workId: "work", evidence },
    })).rejects.toThrow("memory.accept boundary")
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "wrong-accept-evidence", workId: "work", evidence },
    })).rejects.toThrow("memory.accept boundary")
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "valid", workId: "work", evidence },
    })).resolves.toMatchObject({
      id: "valid",
      status: "accepted",
      source: "policy",
      evidence: [{ id: "é", kind: "artifact", digest: "d́" }],
    })
    await expect(ctx.exec({
      flow: commitMemory,
      input: { workId: "work", branchId: "main", value: "preserved", evidence },
    })).resolves.toMatchObject({ id: "preserved", status: "candidate" })
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "preserved", workId: "work", evidence: [] },
    })).rejects.toThrow("memory.accept boundary")
    expect(runtime.record.memory.find((value) => value.id === "preserved")).toMatchObject({
      status: "candidate",
      evidence: [{ id: "é", kind: "artifact", digest: "d́" }],
    })
    runtime.work.settle("work", active.record.attempt, { status: "completed" })

    await ctx.close()
    await scope.dispose()
  })

  it("accepts only increasing candidate-to-accepted memory transitions", async () => {
    const bound = authorityValue()
    let effects = 0
    const accept = flow({
      name: "review.memory.accept",
      parse: typed<{ id: string; workId: string; evidence: readonly [] }>(),
      factory: (ctx) => {
        effects++
        return {
          id: ctx.input.id,
          version: ctx.input.id === "same-version" ? 1 : 2,
          status: ctx.input.id === "wrong-status" ? "candidate" as const : "accepted" as const,
          source: "human" as const,
          evidence: [],
          authorityFingerprint: bound.fingerprint,
        }
      },
    })
    const stored = Object.freeze({
      ...initial(bound),
      memory: Object.freeze([
        { id: "already-accepted", status: "accepted" as const },
        { id: "wrong-status", status: "candidate" as const },
        { id: "same-version", status: "candidate" as const },
        { id: "valid", status: "candidate" as const },
      ].map(({ id, status }) => Object.freeze({
        id,
        version: 1,
        status,
        source: "session" as const,
        evidence: Object.freeze([]),
        authorityFingerprint: bound.fingerprint,
      }))),
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(stored),
      clock(fixedClock),
      memory.accept(accept),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    expect(runtime.record.memory.map((value) => value.id)).toEqual([
      "already-accepted",
      "wrong-status",
      "same-version",
      "valid",
    ])
    const active = runtime.work.admit({ id: "work", branchId: "main", role: "review", policy: "all" })

    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "missing", workId: "work", evidence: [] },
    })).rejects.toThrow("memory.accept boundary")
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "already-accepted", workId: "work", evidence: [] },
    })).rejects.toThrow("memory.accept boundary")
    expect(effects).toBe(0)
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "wrong-status", workId: "work", evidence: [] },
    })).rejects.toThrow("memory.accept boundary")
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "same-version", workId: "work", evidence: [] },
    })).rejects.toThrow("memory.accept boundary")
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "valid", workId: "work", evidence: [] },
    })).resolves.toMatchObject({ id: "valid", version: 2, status: "accepted" })
    expect(effects).toBe(3)
    expect(runtime.record.memory.find((value) => value.id === "valid")).toMatchObject({
      version: 2,
      status: "accepted",
    })
    runtime.work.settle("work", active.record.attempt, { status: "completed" })

    await ctx.close()
    await scope.dispose()
  })
})
