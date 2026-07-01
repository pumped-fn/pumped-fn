import type { Target } from "./graph"

export type Write = (line: string) => void

export function target(value: string): Target {
  if (value === "staging" || value === "production") return value
  throw new Error(`unknown target: ${value}`)
}

export function writeJson(write: Write, value: unknown): void {
  write(JSON.stringify(value))
}
