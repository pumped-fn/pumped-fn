import { atom, controller, createScope, flow, preset, resource, tag, tags, typed, type Lite } from "../src"

const sourceAtom = atom({
  factory: () => 1,
})

const contextTag = tag<string>({ label: "context" })

interface SerializableContext {
  readonly id: string
  readonly revision: number
  readonly active: boolean
  readonly labels: readonly string[]
  readonly parent: { readonly id: string } | null
}

interface SerializableTree {
  readonly value: string
  readonly children: readonly SerializableTree[]
}

interface SerializableLinked {
  readonly next: SerializableLinked | null
}

interface SerializableLeft {
  readonly value: string
  readonly right: SerializableRight | null
}

interface SerializableRight {
  readonly value: number
  readonly left: SerializableLeft | null
}

interface InvalidRecursiveRoot {
  readonly child: InvalidRecursiveChild
}

interface InvalidRecursiveChild extends InvalidRecursiveRoot {
  readonly createdAt: Date
}

const serializableContext = tag<SerializableContext>({
  label: "serializable-context",
  serializable: true,
})
const serializableContextWithDefault = tag<SerializableContext>({
  label: "serializable-context-default",
  serializable: true,
  default: {
    id: "default",
    revision: 0,
    active: false,
    labels: [],
    parent: null,
  },
})
const parsedSerializableContext = tag<SerializableContext>({
  label: "serializable-context-parsed",
  serializable: true,
  parse: (raw: unknown) => raw as SerializableContext,
})
const serializableTree = tag<SerializableTree>({
  label: "serializable-tree",
  serializable: true,
})
const serializableLinked = tag<SerializableLinked>({
  label: "serializable-linked",
  serializable: true,
})
const serializableMutual = tag<SerializableLeft>({
  label: "serializable-mutual",
  serializable: true,
})
const inferredSerializable = tag({
  label: "inferred-serializable",
  serializable: true,
  default: { nested: [1, 2, 3] },
})
const legacyTagOptions: { label: string } = { label: "legacy-tag-options" }
const legacyOptionsTag = tag(legacyTagOptions)
const optionalDefaultConfig: { label: string; default?: string } = { label: "optional-default" }
const optionalDefaultTag: Lite.Tag<string, boolean, false> = tag<string>(optionalDefaultConfig)
const serializableTagOptions: { label: string; serializable: true } = {
  label: "serializable-tag-options",
  serializable: true,
}
const serializableOptionsTag: Lite.Tag<SerializableContext, false, true> = tag<SerializableContext>(serializableTagOptions)
const variableSerializableConfig = {
  label: "variable-serializable-default",
  serializable: true as const,
  default: { id: "fallback" },
}
const variableSerializableTag: Lite.Tag<{ id: string }, true, true> = tag(variableSerializableConfig)
const variableLocalConfig = { label: "variable-local-default", default: "fallback" }
const variableLocalTag: Lite.Tag<string, true, false> = tag(variableLocalConfig)

function jsonTag<T extends Lite.JsonValue>(): Lite.Tag<T, false, true> {
  return tag<T>({ label: "generic-json-tag", serializable: true })
}

interface Wrap<T extends Lite.JsonValue> {
  value: T
}

function wrapTag<T extends Lite.JsonValue>(): Lite.Tag<Wrap<T>, false, true> {
  return tag<Wrap<T>>({ label: "generic-wrap-json-tag", serializable: true })
}

const optionalSerializableOptions: {
  label: string
  serializable: true
  default?: SerializableContext
} = {
  label: "optional-serializable-options",
  serializable: true,
}
const optionalSerializableTag: Lite.Tag<SerializableContext, boolean, true> = tag(optionalSerializableOptions)
const optionalSerializableDefaultOptions: {
  label: string
  serializable: true
  default?: SerializableContext
} = {
  label: "optional-serializable-default-options",
  serializable: true,
  default: {
    id: "default",
    revision: 0,
    active: false,
    labels: [],
    parent: null,
  },
}
const optionalSerializableDefaultTag: Lite.Tag<SerializableContext, boolean, true> = tag(optionalSerializableDefaultOptions)
const serializableContextValue = serializableContext({
  id: "ctx-1",
  revision: 1,
  active: true,
  labels: ["one", "two"],
  parent: { id: "root" },
})
const serializableContextTag: Lite.Tag<SerializableContext, false, true> = serializableContext
const serializableDefaultTag: Lite.Tag<SerializableContext, true, true> = serializableContextWithDefault
const serializableParsedTag: Lite.Tag<SerializableContext, false, true> = parsedSerializableContext
const serializableTagged: Lite.Tagged<SerializableContext, true> = serializableContextValue
const inferredSerializableContext: Lite.Utils.TagValue<typeof serializableContext> = serializableContextValue.value
const ordinaryDate = tag<Date>({ label: "ordinary-date" })
const explicitlyLocalDate = tag<Date>({ label: "explicitly-local-date", serializable: false })
const ordinaryDateTag: Lite.Tag<Date, false, false> = ordinaryDate
const explicitlyLocalTagged: Lite.Tagged<Date, false> = explicitlyLocalDate(new Date())
const broadSerializableTag: Lite.Tag<SerializableContext, false, boolean> = serializableContext

void serializableContextTag
void serializableDefaultTag
void serializableParsedTag
void serializableTree
void serializableLinked
void serializableMutual
void inferredSerializable
void legacyOptionsTag
void optionalDefaultTag
void serializableOptionsTag
void variableSerializableTag
void variableLocalTag
void jsonTag
void wrapTag
void optionalSerializableTag
void optionalSerializableDefaultTag
void serializableTagged
void inferredSerializableContext
void ordinaryDateTag
void explicitlyLocalTagged
void broadSerializableTag

// @ts-expect-error local tagged values cannot be used as serializable holders
const invalidSerializableHolder: Lite.Tagged<Date, true> = explicitlyLocalTagged

void invalidSerializableHolder

// @ts-expect-error serializable tags reject Date values
tag<Date>({ label: "invalid-serializable-date", serializable: true })

// @ts-expect-error serializable tags reject function values
tag<() => void>({ label: "invalid-serializable-function", serializable: true })

// @ts-expect-error serializable tags reject undefined values
tag<string | undefined>({ label: "invalid-serializable-undefined", serializable: true })

// @ts-expect-error serializable tags reject bigint values
tag<bigint>({ label: "invalid-serializable-bigint", serializable: true })

// @ts-expect-error serializable tags reject Map values
tag<Map<string, string>>({ label: "invalid-serializable-map", serializable: true })

// @ts-expect-error serializable tags reject invalid fields inside recursive values
tag<InvalidRecursiveRoot>({ label: "invalid-serializable-recursive", serializable: true })

// @ts-expect-error serializable tags reject inferred Date defaults
tag({ label: "invalid-inferred-default", serializable: true, default: new Date() })

// @ts-expect-error serializable tags reject inferred Date parser outputs
tag({ label: "invalid-inferred-parser", serializable: true, parse: () => new Date() })

const invalidVariableDefault = {
  label: "invalid-variable-default",
  serializable: true as const,
  default: new Date(),
}

// @ts-expect-error serializable config variables reject Date defaults
tag(invalidVariableDefault)

const invalidVariableParser = {
  label: "invalid-variable-parser",
  serializable: true as const,
  parse: () => new Date(),
}

// @ts-expect-error serializable config variables reject Date parser outputs
tag(invalidVariableParser)

// @ts-expect-error broad object types do not prove JSON-compatible fields
tag<object>({ label: "invalid-broad-object", serializable: true })

class SerializableConstructor {
  constructor(readonly id: string) {}
}

// @ts-expect-error serializable tags reject constructor functions
tag<typeof SerializableConstructor>({ label: "invalid-constructor", serializable: true })

type CallableWithData = (() => void) & { id: string }
type ConstructableWithData = (new () => object) & { id: string }

// @ts-expect-error serializable tags reject callable objects with data fields
tag<CallableWithData>({ label: "invalid-callable-data", serializable: true })

// @ts-expect-error serializable tags reject constructable objects with data fields
tag<ConstructableWithData>({ label: "invalid-constructable-data", serializable: true })

const scope = createScope()

scope.createContext({ tags: [contextTag("ok")] })
scope.createContext({ tags: contextTag("single") })
scope.createContext({ tags: [contextTag("nested"), [contextTag("list")]] })
const parentCtx = scope.createContext()
scope.createContext({ parent: parentCtx, tags: [contextTag("child")] })
const contextTags: Lite.ContextTags = parentCtx.tags
contextTags.set([contextTag("one"), [contextTag("two")]])
const contextTagValue: string | undefined = contextTags.get(contextTag)
const contextTagValues: readonly string[] = contextTags.getMany(contextTag)
const inheritedContextTagValue: string | undefined = contextTags.seek(contextTag)
const inheritedContextTagValues: readonly string[] = contextTags.seekMany(contextTag)
const hasContextTag: boolean = contextTags.has(contextTag)
const deletedContextTag: boolean = contextTags.delete(contextTag)
const stopContextTagWatch: () => void = contextTags.watch(contextTag, (values) => {
  const watchedValues: readonly string[] = values
  void watchedValues
}, { initial: true })

void contextTagValue
void contextTagValues
void inheritedContextTagValue
void inheritedContextTagValues
void hasContextTag
void deletedContextTag
void stopContextTagWatch

// @ts-expect-error tag storage accepts bound tag values, not tag definitions
contextTags.set(contextTag)

// @ts-expect-error tag family values stay typed
contextTags.watch(contextTag, (values: readonly number[]) => values)

// @ts-expect-error createContext takes an options object, not bare tags
scope.createContext([contextTag("legacy")])

// @ts-expect-error createContext options use the tags key
scope.createContext({ tag: [contextTag("typo")] })

// @ts-expect-error tags require bound values, not tag definitions
scope.createContext({ tags: contextTag })

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
