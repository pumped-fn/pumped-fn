import { atom, controller, service } from "../src/atom"
import { flow, typed } from "../src/flow"
import { preset } from "../src/preset"
import { resource } from "../src/resource"
import { createScope } from "../src/scope"
import { tag } from "../src/tag"
import type { Lite } from "../src/types"

const sourceAtom = atom({
  factory: () => 1,
})

const contextTag = tag<string>({ label: "context" })
const scope = createScope()

scope.createContext({ tags: [contextTag("ok")] })
const parentCtx = scope.createContext()
scope.createContext({ parent: parentCtx, tags: [contextTag("child")] })

// @ts-expect-error createContext takes an options object, not bare tags
scope.createContext([contextTag("legacy")])

// @ts-expect-error createContext options only accept tags and parent
scope.createContext({ tag: [contextTag("typo")] })

atom({
  deps: { source: controller(sourceAtom, { resolve: true, watch: true }) },
  factory: (_ctx, { source }) => source.get(),
})

flow({
  deps: {
    source: controller(sourceAtom, { resolve: true }),
  },
  factory: (_ctx, { source }) => source.get(),
})

flow({
  deps: {
    source: controller(sourceAtom),
  },
  factory: async (_ctx, { source }) => {
    await source.resolve()
    return source.get()
  },
})

resource({
  ownership: "current",
  deps: {
    source: controller(sourceAtom, { resolve: true }),
  },
  factory: (_ctx, { source }) => source.get(),
})

resource({
  ownership: "boundary",
  factory: () => 1,
})

resource({
  // @ts-expect-error ownership only accepts boundary or current
  ownership: "scope",
  factory: () => 1,
})

// @ts-expect-error watch:true requires resolve:true
controller(sourceAtom, { watch: true })

const legalExecutionDep: Lite.ExecutionDependency = controller(sourceAtom, { resolve: true })

// @ts-expect-error watch:true is only legal in execution deps
const illegalExecutionDep: Lite.ExecutionDependency = controller(sourceAtom, { resolve: true, watch: true })

// @ts-expect-error loose tag-like objects are not valid deps
const illegalAtomDep: Lite.AtomDependency = { mode: "required" }

void legalExecutionDep
void illegalExecutionDep
void illegalAtomDep

flow({
  factory: (ctx) => {
    // @ts-expect-error cleanup is not available in execution contexts
    ctx.cleanup(() => {})
    return 1
  },
})

resource({
  factory: (ctx) => {
    ctx.cleanup(() => {})
    return 1
  },
})

const sourceResource = resource({
  factory: (ctx) => {
    ctx.cleanup(() => {})
    return 1
  },
})

resource({
  deps: {
    source: controller(sourceResource),
  },
  factory: async (_ctx, { source }) => {
    await source.resolve()
    source.get()
    await source.release()
    source.on("*", () => {})
    // @ts-expect-error resource controllers do not mutate values directly
    source.set(1)
    // @ts-expect-error resource controllers do not mutate values directly
    source.update(() => 2)
    // @ts-expect-error resource controllers reset through release(), not invalidate()
    source.invalidate()
    return 1
  },
})

resource({
  deps: {
    source: controller(sourceResource, { resolve: true, watch: true }),
  },
  factory: (_ctx, { source }) => {
    const ctrl: Lite.ResourceController<number> = source
    return ctrl.get()
  },
})

resource({
  deps: {
    source: controller(sourceResource, {
      resolve: true,
      watch: true,
      eq: (a, b) => a.toFixed() === b.toFixed(),
    }),
  },
  factory: (_ctx, { source }) => source.get(),
})

flow({
  deps: {
    source: controller(sourceResource, { resolve: true }),
  },
  factory: (_ctx, { source }) => source.get(),
})

flow({
  deps: {
    // @ts-expect-error watched resource controller deps are resource-only
    source: controller(sourceResource, { resolve: true, watch: true }),
  },
  factory: (_ctx, { source }) => source.get(),
})

atom({
  deps: {
    // @ts-expect-error resource controller deps require an ExecutionContext
    source: controller(sourceResource),
  },
  factory: (_ctx, { source }) => source.get(),
})

// @ts-expect-error resource controller watch requires resolve:true
controller(sourceResource, { watch: true })

// @ts-expect-error resource controller eq requires watch:true
controller(sourceResource, { resolve: true, eq: Object.is })

// @ts-expect-error watched resource controller deps are resource-only
const illegalWatchedResourceExecutionDep: Lite.ExecutionDependency = controller(sourceResource, { resolve: true, watch: true })

void illegalWatchedResourceExecutionDep

flow({
  factory: async (ctx) => {
    await ctx.resolve(sourceAtom)
    await ctx.resolve(sourceResource)
    await ctx.release(sourceResource)
    const resourceCtrl = ctx.controller(sourceResource)
    await resourceCtrl.resolve()
    resourceCtrl.get()
    await resourceCtrl.release()
    resourceCtrl.on("*", () => {})
    resourceCtrl.on("idle", () => {})
    // @ts-expect-error resource controllers do not mutate values directly
    resourceCtrl.set(1)
    // @ts-expect-error resource controllers do not mutate values directly
    resourceCtrl.update(() => 2)
    // @ts-expect-error resource controllers reset through release(), not invalidate()
    resourceCtrl.invalidate()
    // @ts-expect-error atom release stays on Scope
    await ctx.release(sourceAtom)
    // @ts-expect-error resolve has no options overload
    await ctx.resolve(sourceResource, {})
    return 1
  },
})

const functionResource = resource<() => number>({
  factory: () => () => 1,
})

preset(sourceResource, (ctx) => {
  ctx.cleanup(() => {})
  return 2
})

preset(functionResource, (ctx) => {
  ctx.cleanup(() => {})
  return () => 2
})

// @ts-expect-error direct function-valued resource presets are ambiguous; use a resource or factory
preset(functionResource, () => 2)

atom({
  factory: (ctx) => {
    // @ts-expect-error onClose is not available in resolve contexts
    ctx.onClose(() => {})
    return 1
  },
})

// D1: FlowOutput must extract output type, not collapse to never

const typedInputFlow = flow({
  parse: typed<string>(),
  factory: (ctx) => ({ id: ctx.input }),
})

const noParseFlow = flow({
  factory: (_ctx) => 42,
})

type TypedInputFlowOutput = Lite.Utils.FlowOutput<typeof typedInputFlow>
type NoParseFlowOutput = Lite.Utils.FlowOutput<typeof noParseFlow>

declare const _typedOut: TypedInputFlowOutput
declare const _noParseOut: NoParseFlowOutput

const _typedId: string = _typedOut.id
const _noParseNum: number = _noParseOut

void _typedId
void _noParseNum

const readProfile = flow({
  parse: typed<{ id: string }>(),
  factory: (ctx) => ({ id: ctx.input.id, name: "Ada" }),
})

const orchestrateProfile = flow({
  deps: {
    readProfile,
    namedReadProfile: controller(readProfile, { key: "read-profile", name: "read-profile-step" }),
    noParseFlow,
  },
  factory: async (_ctx, { readProfile, namedReadProfile, noParseFlow }) => {
    const profile = await readProfile.exec({ input: { id: "profile-1" } })
    const profileFromController = await namedReadProfile.exec({ input: { id: "profile-1b" } })
    const directNumber = await noParseFlow.exec()
    const explicitVoidNumber = await noParseFlow.exec({ input: undefined })
    const rawProfile = await readProfile.exec({ rawInput: { id: "profile-2" } })
    const namedProfile = await readProfile.exec({ input: { id: "profile-3" }, name: "read-profile-step" })
    const preparedProfile = readProfile.prepare({ key: "profile-4", input: { id: "profile-4" } })
    await preparedProfile.ready
    const prepared = await preparedProfile.exec()
    const id: string = profile.id
    const controllerId: string = profileFromController.id
    const direct: number = directNumber
    const explicit: number = explicitVoidNumber
    const raw: string = rawProfile.name
    const named: string = namedProfile.name
    const preparedName: string = prepared.name
    const preparedKey: string | undefined = preparedProfile.key

    // @ts-expect-error flow handle requires typed input
    await readProfile.exec()

    // @ts-expect-error flow handle rejects wrong input shape
    await readProfile.exec({ input: "profile-1" })

    return { id, controllerId, direct, explicit, raw, named, preparedName, preparedKey }
  },
})

resource({
  deps: { readProfile },
  factory: async (_ctx, { readProfile }) => readProfile.exec({ input: { id: "resource-profile" } }),
})

atom({
  deps: {
    // @ts-expect-error flow deps require an execution context
    readProfile,
  },
  factory: () => 1,
})

atom({
  deps: {
    // @ts-expect-error flow controller deps require an execution context
    readProfile: controller(readProfile),
  },
  factory: () => 1,
})

// @ts-expect-error atom controller options cannot use flow execution defaults
controller(sourceAtom, { name: "source" })

// @ts-expect-error resource controller options cannot use flow execution defaults
controller(sourceResource, { key: "source-resource" })

// @ts-expect-error flow controller options cannot use atom/resource controller options
controller(readProfile, { resolve: true })

// @ts-expect-error flow controller options cannot use watch
controller(readProfile, { resolve: true, watch: true })

void orchestrateProfile

// D1: DepsOf must extract deps from Atom and Flow
const atomWithDeps = atom({
  deps: { source: sourceAtom },
  factory: (_ctx, { source }) => source,
})

type AtomDepsResult = Lite.Utils.DepsOf<typeof atomWithDeps>
declare const _atomDeps: NonNullable<AtomDepsResult>
const _atomSource: Lite.Atom<number> = _atomDeps['source'] as Lite.Atom<number>
void _atomSource
