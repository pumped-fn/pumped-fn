import { presetSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"
import { isAtom } from "./atom"
import { isFlow } from "./flow"

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
 *   presets: [preset(dbAtom, mockDatabase)]
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
 * const scope = createScope({
 *   presets: [preset(processFlow, mockProcessFlow)]
 * })
 *
 * // Replace with a function (deps are NOT resolved)
 * const scope = createScope({
 *   presets: [preset(processFlow, (ctx) => ({ result: ctx.input }))]
 * })
 * ```
 */
export function preset<TOutput, TInput>(
  target: Lite.Flow<TOutput, TInput>,
  value: Lite.Flow<TOutput, TInput> | ((ctx: Lite.ExecutionContext & { readonly input: TInput }) => MaybePromise<TOutput>)
): Lite.Preset<TOutput, TInput>

export function preset<T, I>(
  target: Lite.PresetTarget<T, I>,
  value: Lite.PresetValue<T, I>
): Lite.Preset<T, I> {
  if (!isAtom(target) && !isFlow(target)) {
    throw new Error("preset target must be Atom or Flow")
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
