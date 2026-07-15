import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import {
  controller,
  createScope,
  flow,
  resource,
  tag,
  tags,
} from "../../../../../pkg/core/lite/dist/index.mjs"
import {
  authority,
  clock,
  commit,
  createAuthority,
  loadAndBind,
  record,
  session,
  store,
  wait,
} from "../../../../../pkg/sdk/core/dist/session.mjs"

const marker = tag({ label: "probe.activation.marker" })
const observed = []
let instances = 0

const activation = resource({
  name: "probe.activation",
  ownership: "current",
  deps: { marker: tags.required(marker) },
  factory: (_ctx, { marker }) => ({ id: ++instances, marker }),
})

const leaf = flow({
  name: "probe.leaf",
  deps: {
    activation,
    marker: tags.required(marker),
  },
  factory: (_ctx, deps) => ({
    instanceId: deps.activation.id,
    resourceMarker: deps.activation.marker,
    visibleMarker: deps.marker,
  }),
})

const entry = flow({
  name: "probe.entry",
  deps: {
    activation,
    leaf: controller(leaf),
    marker: tags.required(marker),
  },
  factory: async (_ctx, deps) => ({
    entryInstanceId: deps.activation.id,
    entryMarker: deps.marker,
    leaf: await deps.leaf.exec(),
  }),
})

const authorityValue = createAuthority({
  tenant: "tenant-a",
  roots: ["/workspace"],
  permissions: ["database:read"],
  tools: ["inspect_schema"],
  sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
})

const initial = (id) => Object.freeze({
  id,
  version: 0,
  schemaVersion: 1,
  status: "open",
  authorityFingerprint: authorityValue.fingerprint,
  authorityConstraints: authorityValue,
  currentBranchId: "main",
  branches: Object.freeze([{
    id: "main",
    version: 0,
    createdBy: "bootstrap",
    authorityFingerprint: authorityValue.fingerprint,
    authority: authorityValue,
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

const fixedClock = { now: () => "2026-07-15T00:00:00.000Z" }

const sdkLeaf = flow({
  name: "probe.sdk.leaf",
  deps: {
    session,
    marker: tags.required(marker),
  },
  factory: (_ctx, deps) => ({ runtime: deps.session, marker: deps.marker }),
})

const sdkEntry = flow({
  name: "probe.sdk.entry",
  deps: {
    session,
    leaf: controller(sdkLeaf),
  },
  factory: async (_ctx, deps) => ({
    runtime: deps.session,
    leaf: await deps.leaf.exec(),
  }),
})

async function digest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}

const extension = {
  name: "probe.observer",
  wrapExec: async (next, target, ctx) => {
    observed.push({ flow: target.name, marker: ctx.data.seekTag(marker) })
    return next()
  },
}

const genericScope = createScope({ extensions: [extension] })
const genericRoot = genericScope.createContext()
const [left, right] = await Promise.all([
  genericRoot.exec({ flow: entry, tags: [marker("left")] }),
  genericRoot.exec({ flow: entry, tags: [marker("right")] }),
])

assert.equal(left.entryMarker, "left")
assert.equal(left.leaf.visibleMarker, "left")
assert.equal(left.entryInstanceId, left.leaf.instanceId)
assert.equal(right.entryMarker, "right")
assert.equal(right.leaf.visibleMarker, "right")
assert.equal(right.entryInstanceId, right.leaf.instanceId)
assert.notEqual(left.entryInstanceId, right.entryInstanceId)
assert.deepEqual(observed.toSorted((a, b) => `${a.marker}:${a.flow}`.localeCompare(`${b.marker}:${b.flow}`)), [
  { flow: "probe.entry", marker: "left" },
  { flow: "probe.leaf", marker: "left" },
  { flow: "probe.entry", marker: "right" },
  { flow: "probe.leaf", marker: "right" },
].toSorted((a, b) => `${a.marker}:${a.flow}`.localeCompare(`${b.marker}:${b.flow}`)))

await genericRoot.close()
await genericScope.dispose()

let commitCalls = 0
let stored = initial("checkpoint-session")
const commitImpl = flow({
  name: "probe.store.commit",
  factory: (ctx) => {
    commitCalls++
    stored = Object.freeze({ ...ctx.input.record, version: ctx.input.expectedVersion + 1 })
    return { version: stored.version }
  },
})
const loadImpl = flow({
  name: "probe.store.load",
  factory: () => stored,
})

const checkpoint = flow({
  name: "probe.sdk.checkpoint",
  deps: {
    session,
    wait: controller(wait),
    commit: controller(commit),
  },
  factory: async (_ctx, deps) => {
    await deps.wait.exec({
      input: {
        work: { id: "deferred", branchId: "main", role: "triage", policy: "all" },
        intent: {
          id: "wake-deferred",
          dueAt: "2026-07-16T00:00:00.000Z",
          priority: 1,
          expectedSessionVersion: deps.session.record.version,
        },
      },
    })
    await deps.commit.exec({
      input: {
        record: deps.session.snapshot("open"),
        expectedVersion: deps.session.record.version,
      },
    })
    return deps.session
  },
})

const inspectResume = flow({
  name: "probe.sdk.resume",
  deps: { session },
  factory: (_ctx, deps) => ({
    id: deps.session.record.id,
    status: deps.session.status,
    work: deps.session.record.work.map(({ id, status, attempt }) => ({ id, status, attempt })),
    schedules: deps.session.record.schedules.map(({ id }) => id),
  }),
})

const sdkScope = createScope({ tags: [store.commit(commitImpl), store.load(loadImpl)] })
const sdkRoot = sdkScope.createContext()
const first = await sdkRoot.exec({
  flow: sdkEntry,
  tags: [
    authority(authorityValue),
    record(initial("left-session")),
    clock(fixedClock),
    marker("left-sdk"),
  ],
})
const second = await sdkRoot.exec({
  flow: sdkEntry,
  tags: [
    authority(authorityValue),
    record(initial("right-session")),
    clock(fixedClock),
    marker("right-sdk"),
  ],
})

assert.equal(first.runtime, first.leaf.runtime)
assert.equal(first.leaf.marker, "left-sdk")
assert.equal(second.runtime, second.leaf.runtime)
assert.equal(second.leaf.marker, "right-sdk")
assert.notEqual(first.runtime, second.runtime)
assert.equal(first.runtime.status, "finishing")
assert.equal(first.runtime.record.status, "finishing")
assert.equal(commitCalls, 0)

const checkpointRuntime = await sdkRoot.exec({
  flow: checkpoint,
  tags: [authority(authorityValue), record(stored), clock(fixedClock)],
})

assert.equal(checkpointRuntime.status, "finishing")
assert.equal(commitCalls, 1)
assert.equal(stored.status, "open")
assert.deepEqual(stored.work.map(({ id, status, attempt }) => ({ id, status, attempt })), [
  { id: "deferred", status: "waiting", attempt: 1 },
])

const bindings = await sdkRoot.exec({
  flow: loadAndBind,
  input: { id: stored.id, authority: authorityValue },
})
const resumed = await sdkRoot.exec({
  flow: inspectResume,
  tags: [...bindings.tags, clock(fixedClock)],
})

assert.deepEqual(resumed, {
  id: "checkpoint-session",
  status: "open",
  work: [{ id: "deferred", status: "waiting", attempt: 1 }],
  schedules: ["wake-deferred"],
})

await sdkRoot.close()
await sdkScope.dispose()

const result = {
  probe: "dkr-1-activation-context-v1",
  pass: true,
  claims: {
    execTagsVisibleToEntryAndDescendants: true,
    currentResourceReusedByNestedExec: true,
    siblingExecResourcesIsolated: true,
    extensionSeesActivationAndDescendantTags: true,
    closeAvoidsStoreCommit: true,
    closeAvoidsRuntimeBusinessStateMutation: false,
    checkpointCloseLoadResumeWithoutContextRetention: true,
  },
  observations: {
    cleanupRuntimeStatus: first.runtime.status,
    cleanupRecordStatus: first.runtime.record.status,
    commitCallsBeforeCheckpoint: 0,
    durableCheckpointStatus: stored.status,
    durableCheckpointVersion: stored.version,
    resumed,
  },
  sourceHashes: {
    liteScope: await digest("pkg/core/lite/src/scope.ts"),
    sdkSession: await digest("pkg/sdk/core/src/session.ts"),
    liteDist: await digest("pkg/core/lite/dist/index.mjs"),
    sdkSessionDist: await digest("pkg/sdk/core/dist/session.mjs"),
  },
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
