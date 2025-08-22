import * as multi from "../src/multi"
import { expect, test } from "vitest"
import { custom } from "../src/ssch"
import { createScope } from "../src/scope"
import * as base from "../src/executor"

test("multi provide should work", async () => {
  const multiProvide = multi.provide(
    { keySchema: custom<string>() },
    (key) => {
      return { name: key }
    })

  expect(multiProvide('1'), 'should be same reference').toBe(multiProvide('1'))
  const scope = createScope()

  const directValue = await scope.resolve(multiProvide('1'))

  const provider = await scope.resolve(multiProvide)
  const indirectValue = await provider('1').resolve()

  expect(directValue).toBe(indirectValue)

  const derived = base.derive(
    multiProvide('2'),
    (value) => {
      return { derived: value.name }
    }
  )

  const result = await scope.resolve(derived)
  expect(result).toEqual({ derived: '2' })
  expect(scope.entries().length).toBe(4)
  await multiProvide.release(scope)
  expect(scope.entries().at(0)?.[0]).toBe(derived)
})

test("multi dervie should work", async () => {
  const seed = base.provide(() => 0)
  const derviedLogger = multi.derive(
    { keySchema: custom<string>(), dependencies: seed },
    (seed, key) => seed + key
  )

  const scope = createScope()
  const result = await scope.resolve(derviedLogger('2'))
  expect(result).toEqual('02')
})