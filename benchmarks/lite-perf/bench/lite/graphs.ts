import { atom, controller, createScope, type Lite } from "@pumped-fn/lite"

export let sink: unknown
export const consume = (v: unknown) => {
  sink = v
}

export const noop = () => {}

export async function resolvedController<T>(factory: () => T): Promise<{
  scope: Lite.Scope
  atom: Lite.Atom<T>
  ctrl: Lite.Controller<T>
}> {
  const a = atom({ factory })
  const scope = createScope()
  await scope.resolve(a)
  return { scope, atom: a, ctrl: scope.controller(a) }
}

export function syncChain(depth: number): {
  head: Lite.Atom<number>
  leaf: Lite.Atom<number>
} {
  const head = atom({ factory: () => 0 })
  let prev: Lite.Atom<number> = head
  for (let i = 1; i < depth; i++) {
    const p = prev
    prev = atom({ deps: { p }, factory: (_ctx, d) => d.p + 1 })
  }
  return { head, leaf: prev }
}

export function asyncChain(depth: number): {
  head: Lite.Atom<number>
  leaf: Lite.Atom<number>
} {
  const head = atom({ factory: async () => 0 })
  let prev: Lite.Atom<number> = head
  for (let i = 1; i < depth; i++) {
    const p = prev
    prev = atom({ deps: { p }, factory: async (_ctx, d) => d.p + 1 })
  }
  return { head, leaf: prev }
}

export function wide(n: number): Lite.Atom<number> {
  const deps: Record<string, Lite.Atom<number>> = {}
  for (let i = 0; i < n; i++) deps[`d${i}`] = atom({ factory: () => i })
  return atom({
    deps,
    factory: (_ctx, d) => {
      let sum = 0
      for (const k in d) sum += (d as Record<string, number>)[k]!
      return sum
    },
  })
}

export function watchChain(depth: number): {
  head: Lite.Atom<number>
  leaf: Lite.Atom<number>
} {
  const head = atom({ factory: () => 0 })
  let prev: Lite.Atom<number> = head
  for (let i = 1; i < depth; i++) {
    const p = prev
    prev = atom({
      deps: { p: controller(p, { resolve: true, watch: true }) },
      factory: (_ctx, d) => d.p.get() + 1,
    })
  }
  return { head, leaf: prev }
}

export function watchFanout(n: number): {
  src: Lite.Atom<number>
  dependents: Lite.Atom<number>[]
} {
  const src = atom({ factory: () => 0 })
  const dependents: Lite.Atom<number>[] = []
  for (let i = 0; i < n; i++) {
    dependents.push(
      atom({
        deps: { s: controller(src, { resolve: true, watch: true }) },
        factory: (_ctx, d) => d.s.get() + i,
      })
    )
  }
  return { src, dependents }
}

export function watchFanoutSuppressed(n: number): {
  src: Lite.Atom<{ v: number }>
  dependents: Lite.Atom<number>[]
} {
  const src = atom({ factory: () => ({ v: 0 }) })
  const dependents: Lite.Atom<number>[] = []
  for (let i = 0; i < n; i++) {
    dependents.push(
      atom({
        deps: {
          s: controller(src, { resolve: true, watch: true, eq: () => true }),
        },
        factory: (_ctx, d) => d.s.get().v + i,
      })
    )
  }
  return { src, dependents }
}
