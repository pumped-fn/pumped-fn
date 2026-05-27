import { tag } from "./tag"
import type { Lite } from "./types"

const reservedUseKeys = new Set<string>([
  "cleanup",
  "close",
  "controller",
  "data",
  "exec",
  "input",
  "invalidate",
  "name",
  "onClose",
  "parent",
  "release",
  "resolve",
  "scope",
])

export const uses = tag<readonly Lite.NamedUse<any, any>[]>({
  label: "use",
})

export function addUses(
  tags: Lite.Tagged<any>[] | undefined,
  targetUses: Lite.UseMap | undefined
): Lite.Tagged<any>[] | undefined {
  const normalized = targetUses ? normalizeUses(targetUses) : undefined
  return normalized && normalized.length > 0
    ? [...(tags ?? []), uses(normalized)]
    : tags
}

export function defineUse<Config, Ext extends object = {}, Output = unknown>(options: {
  label?: string
  create: (config: Config, event: Lite.UseCreateEvent) => Lite.UseInstance<Ext, Output>
}): Lite.UseFactory<Config, Ext, Output>
export function defineUse<Ext extends object = {}, Output = unknown>(options: {
  label?: string
  create: (event: Lite.UseCreateEvent) => Lite.UseInstance<Ext, Output>
}): Lite.UseFactory<void, Ext, Output>
export function defineUse(options: {
  label?: string
  create:
    | ((event: Lite.UseCreateEvent) => Lite.UseInstance<object, unknown>)
    | ((config: unknown, event: Lite.UseCreateEvent) => Lite.UseInstance<object, unknown>)
}): Lite.UseFactory<any, any, any> {
  const label = options.label ?? "use"
  const key = Symbol(label)
  const create = options.create
  const createWithConfig = create as (
    config: unknown,
    event: Lite.UseCreateEvent
  ) => Lite.UseInstance<object, unknown>
  const createWithoutConfig = create as (
    event: Lite.UseCreateEvent
  ) => Lite.UseInstance<object, unknown>
  const expectsConfig = create.length > 1
  const factory = ((...args: unknown[]) => ({
    key,
    label,
    create: (event: Lite.UseCreateEvent) => args.length > 0 || expectsConfig
      ? createWithConfig(args[0], event)
      : createWithoutConfig(event),
  })) as Lite.UseFactory<any, any, any>
  Object.defineProperty(factory, "key", { value: key })
  Object.defineProperty(factory, "label", { value: label })
  return factory
}

export function hasUses(target: { readonly tags?: Lite.Tagged<any>[] }): boolean {
  const tags = target.tags
  if (!tags) return false
  for (let i = 0; i < tags.length; i++) {
    if (tags[i]!.key === uses.key) return true
  }
  return false
}

export function applyUseResolve<T>(
  next: () => Promise<T>,
  event: Lite.ResolveEvent
): () => Promise<T> {
  const targetUses = collectUses(event.target)
  if (targetUses.length === 0) return next
  const { instances } = createUseInstances(targetUses, {
    target: event.target,
    ctx: event.ctx,
  })
  let run = next as () => Promise<unknown>
  for (let i = instances.length - 1; i >= 0; i--) {
    const instance = instances[i]!
    if (!instance.wrapResolve) continue
    const current = run
    run = async () => instance.wrapResolve!(current, event)
  }
  return run as () => Promise<T>
}

export function applyUseExec(
  next: () => Promise<unknown>,
  target: Lite.ExecTarget,
  ctx: Lite.ExecutionContext
): () => Promise<unknown> {
  if (typeof target === "function") return next
  const targetUses = collectUses(target)
  if (targetUses.length === 0) return next
  const { instances } = createUseInstances(targetUses, { target, ctx })
  const event = { target, ctx }
  let run = next
  for (let i = instances.length - 1; i >= 0; i--) {
    const instance = instances[i]!
    if (!instance.wrapExec) continue
    const current = run
    run = async () => instance.wrapExec!(current, event)
  }
  return run
}

function normalizeUses(targetUses: Lite.UseMap): Lite.NamedUse<any, any>[] {
  const seen = new Map<symbol, string>()
  const normalized: Lite.NamedUse<any, any>[] = []

  for (const name of Object.keys(targetUses)) {
    if (reservedUseKeys.has(name)) {
      throw new Error(`Use key "${name}" is reserved`)
    }

    const use = targetUses[name]!
    const previous = seen.get(use.key)
    if (previous) {
      throw new Error(`Duplicate use "${use.label}" as "${previous}" and "${name}"`)
    }
    seen.set(use.key, name)
    normalized.push({ name, use })
  }

  return normalized
}

function collectUses(target: { readonly tags?: Lite.Tagged<any>[] }): Lite.NamedUse<any, any>[] {
  const tags = target.tags
  if (!tags) return []
  const collected: Lite.NamedUse<any, any>[] = []
  for (let i = 0; i < tags.length; i++) {
    if (tags[i]!.key !== uses.key) continue
    const group = tags[i]!.value as readonly Lite.NamedUse<any, any>[]
    for (let j = 0; j < group.length; j++) collected.push(group[j]!)
  }
  return collected
}

function createUseInstances(
  targetUses: readonly Lite.NamedUse<any, any>[],
  event: Lite.UseCreateEvent
): { instances: Lite.UseInstance<object, unknown>[] } {
  const seen = new Map<symbol, string>()
  const instances: Lite.UseInstance<object, unknown>[] = []
  const ctxWithExt = event.ctx as Lite.UseContextBase & Record<PropertyKey, unknown>

  for (const { name, use } of targetUses) {
    const previous = seen.get(use.key)
    if (previous) {
      throw new Error(`Duplicate use "${use.label}" as "${previous}" and "${name}"`)
    }
    seen.set(use.key, name)
    const instance = use.create(event)
    if (instance.ext !== undefined) assignUseExt(ctxWithExt, event.target, name, use, instance.ext)
    instances.push(instance)
  }

  return { instances }
}

function useTargetName(target: Lite.UseTarget): string {
  return "name" in target && target.name ? target.name : "anonymous"
}

function assignUseExt(
  ctx: Lite.UseContextBase & Record<PropertyKey, unknown>,
  target: Lite.UseTarget,
  name: string,
  use: Lite.Use<any, any>,
  ext: object
): void {
  if (name in ctx) {
    throw new Error(
      `Use "${use.label}" cannot assign context key "${name}" on "${useTargetName(target)}"`
    )
  }
  ctx[name] = ext
}
