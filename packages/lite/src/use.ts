import { tag } from "./tag"
import type { Lite } from "./types"

export const uses = tag<readonly Lite.Use<any, any>[]>({
  label: "use",
})

export function addUses(
  tags: Lite.Tagged<any>[] | undefined,
  targetUses: readonly Lite.Use<any, any>[] | undefined
): Lite.Tagged<any>[] | undefined {
  return targetUses && targetUses.length > 0
    ? [...(tags ?? []), uses(targetUses)]
    : tags
}

export function defineUse<Config, Ext extends object = {}, Output = unknown>(options: {
  name: string
  create: (config: Config, event: Lite.UseCreateEvent) => Lite.UseInstance<Ext, Output>
}): Lite.UseFactory<Config, Ext, Output>
export function defineUse<Ext extends object = {}, Output = unknown>(options: {
  name: string
  create: (event: Lite.UseCreateEvent) => Lite.UseInstance<Ext, Output>
}): Lite.UseFactory<void, Ext, Output>
export function defineUse(options: {
  name: string
  create:
    | ((event: Lite.UseCreateEvent) => Lite.UseInstance<object, unknown>)
    | ((config: unknown, event: Lite.UseCreateEvent) => Lite.UseInstance<object, unknown>)
}): Lite.UseFactory<any, any, any> {
  const key = Symbol(options.name)
  const create = options.create
  const createWithConfig = create as (
    config: unknown,
    event: Lite.UseCreateEvent
  ) => Lite.UseInstance<object, unknown>
  const createWithoutConfig = create as (
    event: Lite.UseCreateEvent
  ) => Lite.UseInstance<object, unknown>
  const factory = ((...args: unknown[]) => ({
    key,
    name: options.name,
    create: (event: Lite.UseCreateEvent) => args.length > 0
      ? createWithConfig(args[0], event)
      : createWithoutConfig(event),
  })) as Lite.UseFactory<any, any, any>
  Object.defineProperty(factory, "key", { value: key })
  Object.defineProperty(factory, "name", { value: options.name })
  return factory
}

export function useRunner(): Lite.Extension {
  return {
    name: "use-runner",
    async wrapResolve(next, event) {
      const targetUses = collectUses(event.target)
      if (targetUses.length === 0) return next()
      const { instances } = createUseInstances(targetUses, {
        target: event.target,
        ctx: event.ctx,
      })
      let run = next
      for (let i = instances.length - 1; i >= 0; i--) {
        const instance = instances[i]!
        if (!instance.wrapResolve) continue
        const current = run
        run = async () => instance.wrapResolve!(current, event)
      }
      return run()
    },
    async wrapExec(next, target, ctx) {
      if (typeof target === "function") return next()
      const targetUses = collectUses(target)
      if (targetUses.length === 0) return next()
      const { instances } = createUseInstances(targetUses, { target, ctx })
      let run = next
      for (let i = instances.length - 1; i >= 0; i--) {
        const instance = instances[i]!
        if (!instance.wrapExec) continue
        const current = run
        run = async () => instance.wrapExec!(current, { target, ctx })
      }
      return run()
    },
  }
}

export const serializable: Lite.UseFactory<void, {}, Lite.JsonValue> = defineUse({
  name: "serializable",
  create: () => ({
    wrapResolve: async (next) => {
      const value = await next()
      assertSerializable(value)
      return value
    },
    wrapExec: async (next) => {
      const value = await next()
      assertSerializable(value)
      return value
    },
  }),
})

export function assertSerializable(value: unknown): asserts value is Lite.JsonValue {
  assertSerializableValue(value, "$", new WeakSet<object>())
}

function collectUses(target: { readonly tags?: Lite.Tagged<any>[] }): Lite.Use<any, any>[] {
  return uses.collect(target).flat()
}

function createUseInstances(
  targetUses: readonly Lite.Use<any, any>[],
  event: Lite.UseCreateEvent
): { instances: Lite.UseInstance<object, unknown>[] } {
  const seen = new Set<symbol>()
  const instances: Lite.UseInstance<object, unknown>[] = []
  const ctxWithExt = event.ctx as Lite.UseContextBase & { ext?: object }
  ctxWithExt.ext ??= {}

  for (const use of targetUses) {
    if (seen.has(use.key)) throw new Error(`Duplicate use "${use.name}"`)
    seen.add(use.key)
    const instance = use.create(event)
    if (instance.ext) Object.assign(ctxWithExt.ext, instance.ext)
    instances.push(instance)
  }

  return { instances }
}

function assertSerializableValue(value: unknown, path: string, seen: WeakSet<object>): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`)
    return
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError(`Circular value at ${path}`)
    seen.add(value)
    for (let i = 0; i < value.length; i++) {
      assertSerializableValue(value[i], `${path}[${i}]`, seen)
    }
    seen.delete(value)
    return
  }

  if (typeof value !== "object") {
    throw new TypeError(`Non-serializable ${typeof value} at ${path}`)
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`Non-plain object at ${path}`)
  }

  if (seen.has(value)) throw new TypeError(`Circular value at ${path}`)
  seen.add(value)

  const symbols = Object.getOwnPropertySymbols(value)
  if (symbols.length > 0) throw new TypeError(`Symbol key at ${path}`)

  for (const [key, child] of Object.entries(value)) {
    assertSerializableValue(child, `${path}.${key}`, seen)
  }

  seen.delete(value)
}
