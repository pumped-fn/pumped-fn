import { autocompletion } from "@codemirror/autocomplete"
import type { Extension } from "@codemirror/state"
import {
  tsAutocompleteWorker,
  tsFacetWorker,
  tsHoverWorker,
  tsLinterWorker,
  tsSyncWorker,
} from "@valtown/codemirror-ts"
import type { WorkerShape } from "@valtown/codemirror-ts/worker"
import * as Comlink from "comlink"
import { useEffect, useMemo, useState } from "react"

let workerPromise: Promise<WorkerShape> | undefined

function startWorker(): Promise<WorkerShape> {
  workerPromise ??= (async () => {
    const proxy = Comlink.wrap<WorkerShape>(
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    )
    await proxy.initialize()
    return {
      initialize: () => proxy.initialize(),
      updateFile: (input: { path: string; code: string }) => proxy.updateFile(input),
      getLints: (input: { path: string; diagnosticCodesToIgnore: number[] }) => proxy.getLints(input),
      getAutocompletion: (input: Parameters<WorkerShape["getAutocompletion"]>[0]) => proxy.getAutocompletion(input),
      getHover: (input: { path: string; pos: number }) => proxy.getHover(input),
    } as WorkerShape
  })()
  return workerPromise
}

export function useTypeIntel(path: string): Extension[] | undefined {
  const [worker, setWorker] = useState<WorkerShape>()
  useEffect(() => {
    let cancelled = false
    const idle = requestIdleCallback(() => {
      void startWorker().then((ready) => {
        if (!cancelled) setWorker(() => ready)
      })
    }, { timeout: 2500 })
    return () => {
      cancelled = true
      cancelIdleCallback(idle)
    }
  }, [])
  return useMemo(() => {
    if (worker === undefined) return undefined
    return [
      tsFacetWorker.of({ worker, path }),
      tsSyncWorker(),
      tsLinterWorker(),
      autocompletion({ override: [tsAutocompleteWorker()] }),
      tsHoverWorker(),
    ]
  }, [worker, path])
}
