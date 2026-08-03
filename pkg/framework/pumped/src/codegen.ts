import { createHash } from "node:crypto"
import { relative } from "node:path"
import type { EntryDescriptor } from "./discover"

/** Stable project inputs used to identify a generated target manifest. */
export interface ManifestGenerationOptions {
  root: string
  app: string
  target: "server" | "cli"
}

function entryVar(index: number): string {
  return `e${index}`
}

function logicalFile(root: string, file: string): string {
  return relative(root, file).replaceAll("\\", "/")
}

export function generateManifest(
  entries: EntryDescriptor[],
  appFile: string | undefined,
  options: ManifestGenerationOptions
): string {
  const describedEntries = entries.map((entry) => ({
    kind: entry.kind,
    name: entry.name,
    file: logicalFile(options.root, entry.file),
  }))
  const descriptor = {
    app: options.app,
    target: options.target,
    appFile: appFile ? logicalFile(options.root, appFile) : null,
    entries: [...describedEntries].sort((left, right) => (
      `${left.kind}:${left.name}:${left.file}`.localeCompare(`${right.kind}:${right.name}:${right.file}`)
    )),
  }
  const identity = {
    app: options.app,
    target: options.target,
    hash: `sha256:${createHash("sha256").update(JSON.stringify(descriptor)).digest("hex")}`,
  }
  const entryImports = entries.map((entry, index) => `import * as ns${index} from ${JSON.stringify(entry.file)}`)
  const appImport = appFile ? `import app from ${JSON.stringify(appFile)}` : `const app = undefined`
  const needsAgentHelper = entries.some((entry) => entry.kind === "agents")
  const helperImport = needsAgentHelper ? `import { normalizeAgentEntry } from "@pumped-fn/pumped"` : undefined

  const entryGuards = entries.map((entry, index) => {
    const guard = `entryDefault(ns${index}, ${JSON.stringify(entry.name)}, ${JSON.stringify(logicalFile(options.root, entry.file))})`
    return `const ${entryVar(index)} = ${guard}`
  })

  const entryLiterals = entries
    .map((entry, index) => {
      const base = `kind: ${JSON.stringify(entry.kind)}, name: ${JSON.stringify(entry.name)}, file: ${JSON.stringify(logicalFile(options.root, entry.file))}`
      if (entry.kind === "agents") return `  { ${base}, ...normalizeAgentEntry(${entryVar(index)}) }`
      if (entry.kind === "jobs") return `  { ${base}, schedule: ${entryVar(index)} }`
      return `  { ${base}, flow: ${entryVar(index)}, meta: ns${index}.meta }`
    })
    .join(",\n")

  const entryDefaultHelper = [
    "function entryDefault(ns, name, file) {",
    "  if (ns.default === undefined) {",
    '    throw new Error(`entry "${name}" in ${file} has no default export`)',
    "  }",
    "  return ns.default",
    "}",
  ].join("\n")

  return [
    ...entryImports,
    ...(helperImport ? [helperImport] : []),
    appImport,
    "",
    entryDefaultHelper,
    "",
    ...(entryGuards.length > 0 ? [...entryGuards, ""] : []),
    `export const identity = ${JSON.stringify(identity)}`,
    "export { app }",
    "export const entries = [",
    entryLiterals,
    "]",
    "",
  ].join("\n")
}
