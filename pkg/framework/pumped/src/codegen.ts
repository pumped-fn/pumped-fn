import type { EntryDescriptor } from "./discover"

function entryVar(index: number): string {
  return `e${index}`
}

export function generateManifest(entries: EntryDescriptor[], appFile: string | undefined): string {
  const entryImports = entries.map((entry, index) => `import * as ns${index} from ${JSON.stringify(entry.file)}`)
  const appImport = appFile ? `import app from ${JSON.stringify(appFile)}` : `const app = undefined`
  const needsAgentHelper = entries.some((entry) => entry.kind === "agents")
  const helperImport = needsAgentHelper ? `import { normalizeAgentEntry } from "@pumped-fn/pumped"` : undefined

  const entryGuards = entries.map((entry, index) => {
    const guard = `entryDefault(ns${index}, ${JSON.stringify(entry.name)}, ${JSON.stringify(entry.file)})`
    return `const ${entryVar(index)} = ${guard}`
  })

  const entryLiterals = entries
    .map((entry, index) => {
      const base = `kind: ${JSON.stringify(entry.kind)}, name: ${JSON.stringify(entry.name)}, file: ${JSON.stringify(entry.file)}`
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
    "export { app }",
    "export const entries = [",
    entryLiterals,
    "]",
    "",
  ].join("\n")
}
