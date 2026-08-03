import { readdirSync, existsSync } from "node:fs"
import { extname, join, resolve } from "node:path"

export type EntryKind = "server" | "cli" | "jobs" | "agents" | "workflows"

/** Identifies a discovered application entry by kind, name, and source file. */
export interface EntryDescriptor {
  kind: EntryKind
  name: string
  file: string
}

/** Identifies a named application composition by name and source file. */
export interface AppDescriptor {
  name: string
  file: string
}

export interface DiscoveryResult {
  entries: EntryDescriptor[]
  appFile: string | undefined
  apps: AppDescriptor[]
}

const KINDS: EntryKind[] = ["server", "cli", "jobs", "agents", "workflows"]

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
  const entries: EntryDescriptor[] = []

  for (const kind of KINDS) {
    const kindDir = join(root, kind)
    for (const fileName of listEntryFiles(kindDir)) {
      const name = toKebabCase(fileName.replace(extname(fileName), ""))
      entries.push({ kind, name, file: join(kindDir, fileName) })
    }
  }

  const appFile = ["app.ts", "app.tsx", "app.js", "app.mjs"]
    .map((name) => join(root, name))
    .find((file) => existsSync(file))
  const apps = listEntryFiles(join(root, "apps")).map((fileName) => ({
    name: toKebabCase(fileName.replace(extname(fileName), "")),
    file: join(root, "apps", fileName),
  }))

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
