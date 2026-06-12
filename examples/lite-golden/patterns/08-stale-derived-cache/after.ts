import { atom, controller, type Lite } from "@pumped-fn/lite"

export type CartSnapshot = {
  readonly itemCount: number
  readonly subtotalCents: number
}

export type CartSummary = CartSnapshot & {
  readonly label: string
}

export type VersionedSnapshot = {
  readonly version: number
  readonly payload: string
}

export type VersionedSummary = VersionedSnapshot & {
  readonly label: string
}

export type CartSummaryGraph = {
  readonly source: Lite.Atom<CartSnapshot>
  readonly summary: Lite.Atom<CartSummary>
  stats(): { readonly sourceRuns: number; readonly summaryRuns: number }
}

export type DateBucketGraph = {
  readonly source: Lite.Atom<Date>
  readonly bucket: Lite.Atom<string>
  stats(): { readonly sourceRuns: number; readonly bucketRuns: number }
}

export type VersionedSummaryGraph = {
  readonly source: Lite.Atom<VersionedSnapshot>
  readonly summary: Lite.Atom<VersionedSummary>
  stats(): { readonly sourceRuns: number; readonly summaryRuns: number }
}

export type ThreeStepGraph = {
  readonly source: Lite.Atom<number>
  readonly double: Lite.Atom<number>
  readonly label: Lite.Atom<string>
  stats(): { readonly sourceRuns: number; readonly doubleRuns: number; readonly labelRuns: number }
}

export function summarizeCart(snapshot: CartSnapshot): CartSummary {
  return {
    itemCount: snapshot.itemCount,
    subtotalCents: snapshot.subtotalCents,
    label: `${snapshot.itemCount}:${snapshot.subtotalCents}`,
  }
}

export function createCartSummaryGraph(initial: CartSnapshot): CartSummaryGraph {
  let sourceRuns = 0
  let summaryRuns = 0
  const source = atom({
    factory: () => {
      sourceRuns++
      return initial
    },
  })
  const summary = atom({
    deps: { source: controller(source, { resolve: true, watch: true }) },
    factory: (_ctx, { source }) => {
      summaryRuns++
      return summarizeCart(source.get())
    },
  })
  return {
    source,
    summary,
    stats: () => ({ sourceRuns, summaryRuns }),
  }
}

export function createDateBucketGraph(initial: Date): DateBucketGraph {
  let sourceRuns = 0
  let bucketRuns = 0
  const source = atom({
    factory: () => {
      sourceRuns++
      return initial
    },
  })
  const bucket = atom({
    deps: { source: controller(source, { resolve: true, watch: true }) },
    factory: (_ctx, { source }) => {
      bucketRuns++
      return source.get().toISOString()
    },
  })
  return {
    source,
    bucket,
    stats: () => ({ sourceRuns, bucketRuns }),
  }
}

export function createVersionedSummaryGraph(initial: VersionedSnapshot): VersionedSummaryGraph {
  let sourceRuns = 0
  let summaryRuns = 0
  const source = atom({
    factory: () => {
      sourceRuns++
      return initial
    },
  })
  const summary = atom({
    deps: {
      source: controller(source, {
        resolve: true,
        watch: true,
        eq: (prev, next) => prev.version === next.version,
      }),
    },
    factory: (_ctx, { source }) => {
      summaryRuns++
      const snapshot = source.get()
      return {
        version: snapshot.version,
        payload: snapshot.payload,
        label: `${snapshot.version}:${snapshot.payload}`,
      }
    },
  })
  return {
    source,
    summary,
    stats: () => ({ sourceRuns, summaryRuns }),
  }
}

export function createThreeStepGraph(initial: number): ThreeStepGraph {
  let sourceRuns = 0
  let doubleRuns = 0
  let labelRuns = 0
  const source = atom({
    factory: () => {
      sourceRuns++
      return initial
    },
  })
  const double = atom({
    deps: { source: controller(source, { resolve: true, watch: true }) },
    factory: (_ctx, { source }) => {
      doubleRuns++
      return source.get() * 2
    },
  })
  const label = atom({
    deps: { doubled: controller(double, { resolve: true, watch: true }) },
    factory: (_ctx, { doubled }) => {
      labelRuns++
      return `double:${doubled.get()}`
    },
  })
  return {
    source,
    double,
    label,
    stats: () => ({ sourceRuns, doubleRuns, labelRuns }),
  }
}

export function createRetryingSummaryGraph(
  initial: CartSnapshot,
  shouldFail: () => boolean,
  eq: (prev: CartSnapshot, next: CartSnapshot) => boolean
): CartSummaryGraph {
  let sourceRuns = 0
  let summaryRuns = 0
  const source = atom({
    factory: () => {
      sourceRuns++
      return initial
    },
  })
  const summary = atom({
    deps: { source: controller(source, { resolve: true, watch: true, eq }) },
    factory: (_ctx, { source }) => {
      summaryRuns++
      if (shouldFail()) throw new Error("summary unavailable")
      return summarizeCart(source.get())
    },
  })
  return {
    source,
    summary,
    stats: () => ({ sourceRuns, summaryRuns }),
  }
}
