import { presetSymbol } from "./symbols"
import type { Lite } from "./types"

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

export function isPreset(value: unknown): value is Lite.Preset<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[presetSymbol] === true
  )
}
