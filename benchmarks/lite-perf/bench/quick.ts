import { bench as run, type BenchOptions } from "vitest"

const defaults: BenchOptions = {
  iterations: 1,
  time: 75,
  warmupIterations: 1,
  warmupTime: 10,
}

export function bench(
  name: string,
  fn: () => unknown | Promise<unknown>,
  options: BenchOptions = {}
) {
  return run(name, fn, { ...defaults, ...options })
}
