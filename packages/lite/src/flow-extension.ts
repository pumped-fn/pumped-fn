import { tag } from "./tag"
import type { Lite } from "./types"

export const flowExtensions = tag<readonly Lite.FlowExtensionUse<any, any>[]>({
  label: "flow.extensions",
})

export function defineFlowExtension<Config, Ext extends object = {}, Output = unknown>(options: {
  name: string
  create: (config: Config, ctx: Lite.ExecutionContext) => Lite.FlowExtensionInstance<Ext, Output>
}): Lite.FlowExtension<Config, Ext, Output>
export function defineFlowExtension<Ext extends object = {}, Output = unknown>(options: {
  name: string
  create: (ctx: Lite.ExecutionContext) => Lite.FlowExtensionInstance<Ext, Output>
}): Lite.FlowExtension<void, Ext, Output>
export function defineFlowExtension(options: {
  name: string
  create:
    | ((ctx: Lite.ExecutionContext) => Lite.FlowExtensionInstance<object, unknown>)
    | ((config: unknown, ctx: Lite.ExecutionContext) => Lite.FlowExtensionInstance<object, unknown>)
}): Lite.FlowExtension<any, any, any> {
  const key = Symbol(options.name)
  const create = options.create
  const createWithConfig = create as (
    config: unknown,
    ctx: Lite.ExecutionContext
  ) => Lite.FlowExtensionInstance<object, unknown>
  const createWithoutConfig = create as (
    ctx: Lite.ExecutionContext
  ) => Lite.FlowExtensionInstance<object, unknown>
  const extension = ((...args: unknown[]) => ({
    key,
    name: options.name,
    create: (ctx: Lite.ExecutionContext) => args.length > 0
      ? createWithConfig(args[0], ctx)
      : createWithoutConfig(ctx),
  })) as Lite.FlowExtension<any, any, any>
  Object.defineProperty(extension, "key", { value: key })
  Object.defineProperty(extension, "name", { value: options.name })
  return extension
}

export function flowExtensionRunner(): Lite.Extension {
  return {
    name: "flow-extension-runner",
    async wrapExec(next, target, ctx) {
      if (typeof target === "function") return next()
      const uses = flowExtensions.collect(target).flat()
      if (uses.length === 0) return next()

      const seen = new Set<symbol>()
      const instances: Lite.FlowExtensionInstance<object, unknown>[] = []
      const ctxWithExt = ctx as Lite.ExecutionContext & { ext?: object }
      ctxWithExt.ext ??= {}

      for (const use of uses) {
        if (seen.has(use.key)) continue
        seen.add(use.key)
        const instance = use.create(ctx)
        if (instance.ext) Object.assign(ctxWithExt.ext, instance.ext)
        instances.push(instance)
      }

      let run = next
      for (let i = instances.length - 1; i >= 0; i--) {
        const instance = instances[i]!
        if (!instance.wrapExec) continue
        const current = run
        run = async () => instance.wrapExec!(current, { ctx, target })
      }
      return run()
    },
  }
}

export const serializable: Lite.FlowExtension<void, {}, Lite.JsonValue> = defineFlowExtension({
  name: "serializable",
  create: () => ({
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
