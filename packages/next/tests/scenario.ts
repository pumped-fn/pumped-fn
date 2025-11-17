import { it, type TestFunction } from "vitest"

type ScenarioCallback = TestFunction

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
  const { timeout } = options
  if (timeout !== undefined) {
    testFn(`[scenario] ${name}`, { timeout }, runner)
  } else {
    testFn(`[scenario] ${name}`, runner)
  }
}
