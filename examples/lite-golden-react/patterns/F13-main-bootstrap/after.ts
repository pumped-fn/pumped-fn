import { atom, controller, flow, typed } from "@pumped-fn/lite"

export const bootCount = atom({ factory: () => 0 })

export const increment = flow({
  name: "incrementBootCount",
  parse: typed<undefined>(),
  deps: { bootCount: controller(bootCount, { resolve: true }) },
  factory: (_ctx, { bootCount }) => {
    const next = bootCount.get() + 1
    bootCount.set(next)
    return next
  },
})
