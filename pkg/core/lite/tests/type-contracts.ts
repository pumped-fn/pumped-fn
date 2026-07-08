import { atom, controller, service } from "../src/atom"
import { flow, typed } from "../src/flow"
import { preset } from "../src/preset"
import { resource } from "../src/resource"
import { createScope } from "../src/scope"
import { serviceValue } from "../src/service-value"
import { tag, tags } from "../src/tag"
import { traced } from "../src/traced"
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
  factory: () => 1,
})

atom({
  deps: {
    // @ts-expect-error resource controller deps require an ExecutionContext
    source: controller(sourceResource),
  },
  factory: () => 1,
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

// D1: tag-carried flows project to FlowHandle in deps position
const profileFlowTag = tag<typeof readProfile>({ label: "profile-flow" })
type ProfileOutput = Lite.Utils.FlowOutput<typeof readProfile>
type ProfileInput = Lite.Utils.FlowInput<typeof readProfile>

flow({
  deps: {
    required: tags.required(profileFlowTag),
    optional: tags.optional(profileFlowTag),
    all: tags.all(profileFlowTag),
  },
  factory: async (_ctx, { required, optional, all }) => {
    const requiredHandle: Lite.FlowHandle<ProfileOutput, ProfileInput> = required
    const optionalHandle: Lite.FlowHandle<ProfileOutput, ProfileInput> | undefined = optional
    const allHandles: Lite.FlowHandle<ProfileOutput, ProfileInput>[] = all
    const profile = await requiredHandle.exec({ input: { id: "role-tag-profile" } })
    return { profile, optionalHandle, allHandles }
  },
})

// D1: traced capability records project function members to exec handles
const gateway = atom({
  factory: () => ({
    fetch: async (id: string, count: number) => ({ id, count }),
    ping: () => "pong",
  }),
})

const gatewayDep = traced(gateway)
type GatewayProjection = Lite.InferDep<typeof gatewayDep>
declare const _gateway: GatewayProjection
const _fetchResult: Promise<{ id: string; count: number }> = _gateway.fetch.exec({ params: ["profile-1", 1] })
const _pingResult: Promise<string> = _gateway.ping.exec()
const _pingTaggedResult: Promise<string> = _gateway.ping.exec({ tags: [] })

resource({
  deps: {
    // @ts-expect-error traced deps are execution-only
    store: traced(gateway),
  },
  factory: () => 1,
})

// @ts-expect-error traced method params are passed as the original tuple
_gateway.fetch.exec({ params: ["profile-1"] })

// @ts-expect-error empty-arg traced methods only accept tags
_gateway.ping.exec({ params: [] })

const rejectedGateway = atom({
  factory: () => ({
    ping: () => "pong",
    status: "idle",
  }),
})

// @ts-expect-error traced accepts records of functions only
traced(rejectedGateway)

type RejectedProjection = Lite.Traced<{ ping(): string; status: string }>
declare const _rejected: RejectedProjection

// @ts-expect-error non-function members project to never
_rejected.status.exec()

void _fetchResult
void _pingResult
void _pingTaggedResult

type ServiceGateway = {
  fetch(ctx: Lite.ExecutionContext, id: string, count: number): Promise<{ id: string; count: number }>
  ping(ctx: Lite.ExecutionContext): string
}

const serviceGateway = serviceValue<ServiceGateway>({
  fetch: async (_ctx, id, count) => ({ id, count }),
  ping: () => "pong",
})

const serviceGatewayTag = tag<Lite.ServiceValue<ServiceGateway>>({ label: "service-gateway" })
const serviceGatewayDep = tags.required(serviceGatewayTag)
type ServiceGatewayProjection = Lite.InferDep<typeof serviceGatewayDep>
declare const _serviceGateway: ServiceGatewayProjection
const _serviceFetchResult: Promise<{ id: string; count: number }> = _serviceGateway.fetch.exec({ params: ["profile-1", 1] })
const _servicePingResult: Promise<string> = _serviceGateway.ping.exec()
const serviceGatewayResource = resource({
  factory: () => serviceGateway,
})
type ServiceGatewayResourceProjection = Lite.InferDep<typeof serviceGatewayResource>
declare const _serviceGatewayResource: ServiceGatewayResourceProjection
const _serviceResourceFetchResult: Promise<{ id: string; count: number }> = _serviceGatewayResource.fetch.exec({ params: ["profile-1", 1] })
const _serviceResourcePingResult: Promise<string> = _serviceGatewayResource.ping.exec()

// @ts-expect-error service ctx is supplied by the execution pipeline, not params
_serviceGateway.fetch.exec({ params: [scope.createContext(), "profile-1", 1] })

// @ts-expect-error service method params are passed as the original tuple after ctx
_serviceGateway.fetch.exec({ params: ["profile-1"] })

void serviceGateway
void _serviceFetchResult
void _servicePingResult
void _serviceResourceFetchResult
void _serviceResourcePingResult
