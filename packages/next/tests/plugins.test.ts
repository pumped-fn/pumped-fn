import { vi } from "vitest"
import { provide } from "../src/executor"
import * as plugins from "../src/plugins"
import { test } from "vitest"
import { createScope } from "../src/scope"
import { expect } from "vitest"

test('eager plugin triggers immediate execution of marked executors', async () => {
  const fn = vi.fn()
  const value = provide(fn, plugins.eager.meta(true))

  const scope = createScope({
    plugins: [plugins.eager.plugin()],
    registry: [value]
  })

  setTimeout(() => {
    expect(fn).toHaveBeenCalledTimes(1)
  }, 0)
})
