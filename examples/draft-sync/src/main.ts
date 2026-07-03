import { createScope, type Lite } from "@pumped-fn/lite"
import { sync, type Sync } from "@pumped-fn/lite-extension-sync"

const draft = sync({
  id: "draft",
  factory: () => ({ id: "draft", title: "", body: "", version: 0 }),
  conflict: sync.revision("version"),
})

export type Draft = Lite.Utils.AtomValue<typeof draft>

export interface SyncStressOptions {
  readonly edits?: number
  readonly now?: () => number
}

export interface SyncStressResult {
  readonly edits: number
  readonly final: Draft
  readonly records: number
  readonly invalidPayloadRejects: number
  readonly invalidApplyCount: number
  readonly conflictCount: number
  readonly localWriteMs: number
  readonly localWriteMsPerOp: number
}

export async function runSyncStress(options: SyncStressOptions = {}): Promise<SyncStressResult> {
  const edits = options.edits ?? 250
  const now = options.now ?? (() => performance.now())
  const wire = sync.memory()
  const errors: Sync.ErrorPhase[] = []
  const conflicts: Sync.Conflict<unknown>[] = []
  const left = createScope({
    extensions: [sync.extension()],
    tags: [
      sync.runtime({
        peer: "left",
        namespace: "document:proposal",
        transport: wire,
        onError: (_error, phase) => errors.push(phase),
        onConflict: (conflict) => conflicts.push(conflict),
      }),
    ],
  })
  const right = createScope({
    extensions: [sync.extension()],
    tags: [
      sync.runtime({
        peer: "right",
        namespace: "document:proposal",
        transport: wire,
        onError: (_error, phase) => errors.push(phase),
        onConflict: (conflict) => conflicts.push(conflict),
      }),
    ],
  })

  await left.resolve(draft)
  await right.resolve(draft)

  const ctrl = left.controller(draft)
  const mirror = right.controller(draft)
  const start = now()
  for (let i = 1; i <= edits; i++) {
    ctrl.set({
      id: "draft",
      title: `Proposal ${i}`,
      body: `Body revision ${i}`,
      version: i,
    })
    await until(() => mirror.get().version === i)
  }
  const localWriteMs = now() - start
  const beforeInvalid = mirror.get()

  await wire.write({
    key: "document:proposal:draft",
    peer: "corrupt",
    version: edits + 1,
    value: {
      id: "draft",
      title: "corrupt",
      body: Number.NaN,
      version: edits + 1,
    },
  })
  const afterInvalid = mirror.get()

  await wire.write({
    key: "document:proposal:draft",
    peer: "offline",
    version: edits + 2,
    value: {
      id: "draft",
      title: "offline",
      body: "same revision conflict",
      version: edits,
    },
  })

  const result = {
    edits,
    final: mirror.get(),
    records: wire.size(),
    invalidPayloadRejects: errors.filter((phase) => phase === "decode").length,
    invalidApplyCount: Number(JSON.stringify(beforeInvalid) !== JSON.stringify(afterInvalid)),
    conflictCount: conflicts.length,
    localWriteMs,
    localWriteMsPerOp: localWriteMs / edits,
  }

  await left.dispose()
  await right.dispose()
  return result
}

async function until(check: () => boolean): Promise<void> {
  while (!check()) {
    await Promise.resolve()
  }
}
