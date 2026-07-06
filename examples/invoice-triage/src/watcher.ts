import { createScope, type Lite } from "@pumped-fn/lite"
import { readdir, readFile, watch } from "node:fs/promises"
import { join } from "node:path"
import { intake } from "./flows"
import { intakeLines } from "./ports"
import type { IntakeSummary } from "./types"

export interface ImportFileOptions {
  extensions?: readonly Lite.Extension[]
  tags?: readonly Lite.Tagged<any>[]
}

export interface WatchDirectoryOptions extends ImportFileOptions {
  directory: string
  signal?: AbortSignal
}

export async function importInvoiceFile(path: string, options: ImportFileOptions = {}): Promise<IntakeSummary> {
  const scope = createScope({
    extensions: options.extensions === undefined ? undefined : [...options.extensions],
    tags: options.tags === undefined ? undefined : [...options.tags],
  })
  try {
    return await importWithScope(scope, path)
  } finally {
    await scope.dispose()
  }
}

export async function importInvoiceDirectory(directory: string, options: ImportFileOptions = {}): Promise<IntakeSummary> {
  const scope = createScope({
    extensions: options.extensions === undefined ? undefined : [...options.extensions],
    tags: options.tags === undefined ? undefined : [...options.tags],
  })
  try {
    return await importDirectoryWithScope(scope, directory)
  } finally {
    await scope.dispose()
  }
}

export async function watchDirectory(options: WatchDirectoryOptions): Promise<void> {
  const scope = createScope({
    extensions: options.extensions === undefined ? undefined : [...options.extensions],
    tags: options.tags === undefined ? undefined : [...options.tags],
  })
  try {
    await importDirectoryWithScope(scope, options.directory)
    for await (const event of watch(options.directory, { signal: options.signal })) {
      if (event.filename) await importWithScope(scope, join(options.directory, event.filename.toString()))
    }
  } finally {
    await scope.dispose()
  }
}

async function importDirectoryWithScope(scope: Lite.Scope, directory: string): Promise<IntakeSummary> {
  const totals: IntakeSummary = { accepted: 0, rejected: 0 }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const summary = await importWithScope(scope, join(directory, entry.name))
    totals.accepted += summary.accepted
    totals.rejected += summary.rejected
  }
  return totals
}

async function importWithScope(scope: Lite.Scope, path: string): Promise<IntakeSummary> {
  const ctx = scope.createContext({ tags: [intakeLines(lines((await readFile(path, "utf8")).split(/\r?\n/)))] })
  try {
    const summary = await ctx.exec({ flow: intake })
    await ctx.close({ ok: true })
    return summary
  } catch (error) {
    await ctx.close({ ok: false, error })
    throw error
  }
}

async function* lines(items: readonly string[]): AsyncIterable<string> {
  yield* items
}
