import { atom, controller } from "../src/atom"
import { flow } from "../src/flow"
import { preset } from "../src/preset"
import { resource } from "../src/resource"
import type { Lite } from "../src/types"

const sourceAtom = atom({
  factory: () => 1,
})

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
  deps: {
    source: controller(sourceAtom, { resolve: true }),
  },
  factory: (_ctx, { source }) => source.get(),
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
