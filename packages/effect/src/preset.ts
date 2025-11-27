import { presetSymbol } from "./symbols"
import type { Lite } from "./types"

/**
 * Creates a preset value for an Atom, overriding its factory within a scope.
 *
 * @param atom - The Atom to preset
 * @param value - The preset value (can be a direct value or another Atom)
 * @returns A Preset instance to be used in scope configuration
 *
 * @example
 * ```typescript
 * const scope = await createScope({
 *   presets: [preset(dbAtom, mockDatabase)]
 * })
 * ```
 */
export function preset<T>(
  atom: Lite.Atom<T>,
  value: T | Lite.Atom<T>
): Lite.Preset<T> {
  return {
    [presetSymbol]: true,
    atom,
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
 *   console.log(value.atom, value.value)
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
