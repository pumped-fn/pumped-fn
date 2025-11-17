import { it } from "vitest"

type ScenarioCallback = NonNullable<Parameters<typeof it>[1]>

type ScenarioOptions = {
  only?: boolean
  skip?: boolean
  timeout?: number
}

export function scenario(
  name: string,
  runner: ScenarioCallback,
  options: ScenarioOptions = {},
) {
  const testFn = options.only ? it.only : options.skip ? it.skip : it
  testFn(`[scenario] ${name}`, runner, options.timeout)
}
