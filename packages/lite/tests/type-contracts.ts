import { atom, controller } from "../src/atom"
import { flow } from "../src/flow"
import { resource } from "../src/resource"

const sourceAtom = atom({
  factory: () => 1,
})

atom({
  deps: { source: controller(sourceAtom, { resolve: true, watch: true }) },
  factory: (_ctx, { source }) => source.get(),
})

// @ts-expect-error watch:true requires resolve:true
controller(sourceAtom, { watch: true })

flow({
  deps: {
    // @ts-expect-error watch:true is only legal in atom deps
    source: controller(sourceAtom, { resolve: true, watch: true }),
  },
  factory: () => 1,
})

resource({
  deps: {
    // @ts-expect-error watch:true is only legal in atom deps
    source: controller(sourceAtom, { resolve: true, watch: true }),
  },
  factory: () => 1,
})

atom({
  deps: {
    // @ts-expect-error loose tag-like objects are not valid deps
    source: { mode: "required" },
  },
  factory: () => 1,
})

flow({
  factory: (ctx) => {
    // @ts-expect-error cleanup is not available in execution contexts
    ctx.cleanup(() => {})
    return 1
  },
})

resource({
  factory: (ctx) => {
    // @ts-expect-error cleanup is not available in execution contexts
    ctx.cleanup(() => {})
    return 1
  },
})

atom({
  factory: (ctx) => {
    // @ts-expect-error onClose is not available in resolve contexts
    ctx.onClose(() => {})
    return 1
  },
})
