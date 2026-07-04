import { presetSymbol, type Lite, type MaybePromise } from "./types"
import { isAtom } from "./atom"
import { isFlow } from "./flow"
import { isResource } from "./resource"

type ResourcePresetValue<T> =
  | (T extends (...args: any[]) => any ? never : T)
  | Lite.Resource<T>
  | ((ctx: Lite.ResourceContext) => MaybePromise<T>)

/**
 * Creates a preset that overrides an Atom's factory within a scope.
 *
 * @param target - The Atom to preset
 * @param value - The preset value (can be a direct value or another Atom)
 * @returns A Preset instance to be used in scope configuration
 *
 * @example
 * ```typescript
 * const scope = createScope({
 *   presets: [preset(db, mockDatabase)]
 * })
 * ```
 */
export function preset<T>(
  target: Lite.Atom<T>,
  value: T | Lite.Atom<T>
): Lite.Preset<T>

/**
 * Creates a preset that overrides a Flow's execution within a scope.
 *
 * @param target - The Flow to preset
 * @param value - The replacement (another Flow or a function that receives ctx with parsed input)
 * @returns A Preset instance to be used in scope configuration
 *
 * @example
 * ```typescript
 * // Replace with another flow
 * const scopeA = createScope({
 *   presets: [preset(process, processStub)]
 * })
 *
 * // Replace with a function (deps are NOT resolved)
 * const scopeB = createScope({
 *   presets: [preset(process, (ctx) => ({ result: ctx.input }))]
 * })
 * ```
 */
export function preset<TOutput, TInput, TFault, TYield>(
  target: Lite.Flow<TOutput, TInput, TFault, TYield>,
  value:
    | Lite.Flow<TOutput, TInput, TFault, TYield>
    | ((ctx: Lite.ExecutionContext<TFault> & { readonly input: TInput }) => MaybePromise<TOutput> | AsyncGenerator<TYield, TOutput, unknown>)
): Lite.Preset<TOutput, TInput, TYield>

/**
 * Creates a preset that overrides a Resource within an execution context.
 *
 * @param target - The Resource to preset
 * @param value - Direct value, replacement Resource, or function that receives the execution context
 * @returns A Preset instance to be used in scope configuration
 */
export function preset<T>(
  target: Lite.Resource<T>,
  value: ResourcePresetValue<T>
): Lite.Preset<T>

export function preset<T, I, Y>(
  target: Lite.PresetTarget<T, I, Y>,
  value: Lite.PresetValue<T, I, Y>
): Lite.Preset<T, I, Y> {
  if (!isAtom(target) && !isFlow(target) && !isResource(target)) {
    throw new Error("preset target must be Atom, Flow, or Resource")
  }
  if (target === value) {
    throw new Error("preset cannot reference itself")
  }
  return {
    [presetSymbol]: true,
    target,
    value,
  }
}

/**
 * Type guard to check if a value is a Preset.
 *
 * @param value - The value to check
 * @returns True if the value is a Preset, false otherwise
 *
 * @example
 * ```typescript
 * if (isPreset(value)) {
 *   console.log(value.target, value.value)
 * }
 * ```
 */
export function isPreset(value: unknown): value is Lite.Preset<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[presetSymbol] === true
  )
}
