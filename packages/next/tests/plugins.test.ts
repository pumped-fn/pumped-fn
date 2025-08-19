import { vi } from "vitest"
import { provide, derive } from "../src/executor"
import * as plugins from "../src/plugins"
import { test } from "vitest"
import { createScope } from "../src/scope"
import { expect } from "vitest"

test('eager plugin should work', async () => {
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
