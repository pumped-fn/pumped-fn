import { atom } from "@pumped-fn/lite"

const cleanupAtom = atom({
  factory: (ctx) => {
    ctx.cleanup(() => console.log('cleanup'))
    return 42
  }
})

const releaseAtom = atom({
  factory: (ctx) => {
    ctx.invalidate()
    return 'value'
  }
})

const reloadAtom = atom({
  factory: (ctx) => {
    ctx.invalidate()
    return {}
  }
})

const multipleAtom = atom({
  factory: (ctx) => {
    ctx.cleanup(() => {})
    ctx.invalidate()
    ctx.invalidate()
    const scoped = ctx.scope.resolve(otherAtom)
    return scoped
  }
})

const nestedAtom = atom({
  factory: (ctx) => {
    const inner = () => {
      ctx.invalidate()
    }
    ctx.invalidate()
    return inner
  }
})
