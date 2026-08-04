import type { EntryDescriptor, EntryKind } from "./discover"

export type BuildTarget = "server" | "cli"

const TARGET_KINDS: Record<BuildTarget, ReadonlySet<EntryKind>> = {
  server: new Set(["server", "agents", "jobs", "workflows"]),
  cli: new Set(["cli", "agents"]),
}

export function selectTargetEntries(entries: EntryDescriptor[], target: BuildTarget): EntryDescriptor[] {
  return entries.filter((entry) => TARGET_KINDS[target].has(entry.kind))
}

export function buildConfig(target: BuildTarget, app?: string) {
  const entry = target === "server" ? "virtual:pumped/entry-server" : "virtual:pumped/entry-cli"
  const outDir = app === undefined || app === "default"
    ? "dist"
    : `dist/apps/${encodeURIComponent(app)}`

  return {
    build: {
      ssr: true as const,
      outDir,
      emptyOutDir: false,
      rollupOptions: {
        input: entry,
        output: { entryFileNames: `${target}.mjs` },
      },
    },
  }
}

/**
 * Builds the manifest alone so `pumped graph` can read its identity. Declares no SSR
 * externalization of its own, so the module closure behind the embedded content hash matches the
 * production build byte for byte.
 */
export function manifestConfig(input: string, outDir: string) {
  return {
    build: {
      ssr: true as const,
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input,
        output: { entryFileNames: "manifest.mjs" },
      },
    },
  }
}
