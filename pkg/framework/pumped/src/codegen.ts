import type { EntryDescriptor } from "./discover"

export function generateManifest(entries: EntryDescriptor[], appFile: string | undefined): string {
  const entryImports = entries.map(
    (entry, index) => `import e${index}, * as ns${index} from ${JSON.stringify(entry.file)}`
  )
  const appImport = appFile ? `import app from ${JSON.stringify(appFile)}` : `const app = undefined`
  const needsAgentHelper = entries.some((entry) => entry.kind === "agents")
  const helperImport = needsAgentHelper ? `import { normalizeAgentEntry } from "@pumped-fn/pumped"` : undefined

  const entryLiterals = entries
    .map((entry, index) => {
      const base = `kind: ${JSON.stringify(entry.kind)}, name: ${JSON.stringify(entry.name)}, file: ${JSON.stringify(entry.file)}`
      return entry.kind === "agents"
        ? `  { ${base}, ...normalizeAgentEntry(e${index}) }`
        : `  { ${base}, flow: e${index}, meta: ns${index}.meta }`
    })
    .join(",\n")

  return [
    ...entryImports,
    ...(helperImport ? [helperImport] : []),
    appImport,
    "",
    "export { app }",
    "export const entries = [",
    entryLiterals,
    "]",
    "",
  ].join("\n")
}
