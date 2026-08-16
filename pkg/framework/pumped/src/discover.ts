import { readdirSync, existsSync } from "node:fs"
import { extname, join, resolve } from "node:path"

/** Identifies a discovered entry module by name and source file. */
export interface EntryFile {
  name: string
  file: string
}

/** Identifies a named application composition by name and source file. */
export interface AppDescriptor {
  name: string
  file: string
}

export interface DiscoveryResult {
  entries: EntryFile[]
  appFile: string | undefined
  apps: AppDescriptor[]
}

const LEGACY_KINDS = ["server", "cli", "jobs", "agents", "workflows"]

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()
}

function listEntryFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && [".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name)))
    .map((entry) => entry.name)
    .sort()
}

export function discover(sourceDir: string): DiscoveryResult {
  const root = resolve(sourceDir)
  const entriesDir = join(root, "entries")

  const legacy = LEGACY_KINDS.filter((kind) => existsSync(join(root, kind)))
  if (legacy.length > 0) {
    throw new Error(
      `found legacy entry directories (${legacy.map((kind) => `src/${kind}`).join(", ")}); ` +
        `pumped discovers only src/entries — move each entry there and default-export entry({ flow, tags }), ` +
        `then delete or rename the old directories`
    )
  }

  const entries: EntryFile[] = listEntryFiles(entriesDir).map((fileName) => ({
    name: toKebabCase(fileName.replace(extname(fileName), "")),
    file: join(entriesDir, fileName),
  }))

  const appFile = ["app.ts", "app.tsx", "app.js", "app.mjs"]
    .map((name) => join(root, name))
    .find((file) => existsSync(file))
  const apps: AppDescriptor[] = []
  const appNames = new Map<string, string>()
  for (const fileName of listEntryFiles(join(root, "apps"))) {
    const name = toKebabCase(fileName.replace(extname(fileName), ""))
    const file = join(root, "apps", fileName)
    const existing = appNames.get(name)
    if (name === "default") throw new Error(`named app "default" is reserved for ${appFile ?? "src/app.ts"}`)
    if (existing) throw new Error(`named app "${name}" is ambiguous: ${existing}, ${file}`)
    appNames.set(name, file)
    apps.push({ name, file })
  }

  return { entries, appFile, apps }
}

export function selectAppFile(discovery: DiscoveryResult, name?: string): string | undefined {
  if (name === undefined || name === "default") {
    if (name === undefined || discovery.appFile !== undefined) return discovery.appFile
  } else {
    const selected = discovery.apps.find((candidate) => candidate.name === name)
    if (selected) return selected.file
  }

  const available = [
    ...(discovery.appFile === undefined ? [] : ["default"]),
    ...discovery.apps.map((candidate) => candidate.name),
  ]
  throw new Error(
    available.length === 0
      ? `app "${name}" was not found; no apps are available`
      : `app "${name}" was not found; available apps: ${available.join(", ")}`
  )
}
