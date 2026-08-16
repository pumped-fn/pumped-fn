import { createHash } from "node:crypto"
import { relative } from "node:path"
import { flowSymbol } from "@pumped-fn/lite"
import type { EntryFile } from "./discover"
import { entryBrandKey } from "./entry"
import type { ManifestIdentity } from "./runtime/manifest"

/** Stable project inputs used to identify a generated target manifest. */
export interface ManifestGenerationOptions {
  root: string
  app: string
  target: "app" | "server" | "cli"
}

/** Generated manifest module source plus the identity embedded in it. */
export interface GeneratedManifestSource {
  source: string
  identity: ManifestIdentity
}

function entryVar(index: number): string {
  return `e${index}`
}

export function logicalFile(root: string, file: string): string {
  return relative(root, file).replaceAll("\\", "/")
}

const ASSERT_ENTRY_HELPER = [
  `const ENTRY = Symbol.for(${JSON.stringify(entryBrandKey)})`,
  `const FLOW = Symbol.for(${JSON.stringify(Symbol.keyFor(flowSymbol))})`,
  "function assertEntry(value, name, file) {",
  "  if (value === undefined) {",
  '    throw new Error(`entry "${name}" in ${file} has no default export`)',
  "  }",
  '  if (typeof value === "object" && value !== null && ENTRY in value) return value',
  '  if (typeof value === "object" && value !== null && FLOW in value) {',
  '    throw new Error(`entry "${name}" in ${file} default-exports a bare flow; wrap it in entry({ flow, tags })`)',
  "  }",
  '  throw new Error(`entry "${name}" in ${file} must default-export entry({ flow, tags })`)',
  "}",
].join("\n")

export function generateManifest(
  entries: EntryFile[],
  appFile: string | undefined,
  options: ManifestGenerationOptions
): GeneratedManifestSource {
  const describedEntries = entries.map((entry) => ({
    name: entry.name,
    file: logicalFile(options.root, entry.file),
  }))
  const descriptor = {
    app: options.app,
    target: options.target,
    appFile: appFile ? logicalFile(options.root, appFile) : null,
    entries: [...describedEntries].sort((left, right) =>
      `${left.name}:${left.file}`.localeCompare(`${right.name}:${right.file}`)
    ),
  }
  const identity: ManifestIdentity = {
    app: options.app,
    target: options.target,
    hash: `sha256:${createHash("sha256").update(JSON.stringify(descriptor)).digest("hex")}`,
  }
  const entryImports = entries.map((entry, index) => `import * as ns${index} from ${JSON.stringify(entry.file)}`)
  const appImport = appFile ? `import app from ${JSON.stringify(appFile)}` : `const app = undefined`

  const entryGuards = entries.map((entry, index) => {
    const guard = `assertEntry(ns${index}.default, ${JSON.stringify(entry.name)}, ${JSON.stringify(logicalFile(options.root, entry.file))})`
    return `const ${entryVar(index)} = ${guard}`
  })

  const entryLiterals = entries
    .map(
      (entry, index) =>
        `  { name: ${JSON.stringify(entry.name)}, file: ${JSON.stringify(logicalFile(options.root, entry.file))}, entry: ${entryVar(index)} }`
    )
    .join(",\n")

  const source = [
    ...entryImports,
    appImport,
    "",
    ASSERT_ENTRY_HELPER,
    "",
    ...(entryGuards.length > 0 ? [...entryGuards, ""] : []),
    `export const identity = ${JSON.stringify(identity)}`,
    "export { app }",
    "export const entries = [",
    entryLiterals,
    "]",
    "",
  ].join("\n")

  return { source, identity }
}
