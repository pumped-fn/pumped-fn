import { provide } from "@pumped-fn/core-next"

const cleanupAtom = provide((ctx) => {
  ctx.cleanup(() => console.log('cleanup'))
  return 42
})

const releaseAtom = provide((ctx) => {
  ctx.release()
  return 'value'
})

const reloadAtom = provide((ctx) => {
  ctx.reload()
  return {}
})

const multipleAtom = provide((ctx) => {
  ctx.cleanup(() => {})
  ctx.release()
  ctx.reload()
  const scoped = ctx.scope.resolve(otherAtom)
  return scoped
})

const nestedAtom = provide((ctx) => {
  const inner = () => {
    ctx.release()
  }
  ctx.reload()
  return inner
})
