import type { EntryDescriptor, EntryKind } from "./discover"

export type BuildTarget = "server" | "cli"

const TARGET_KINDS: Record<BuildTarget, ReadonlySet<EntryKind>> = {
  server: new Set(["server", "agents", "jobs", "workflows"]),
  cli: new Set(["cli", "agents"]),
}

export function selectTargetEntries(entries: EntryDescriptor[], target: BuildTarget): EntryDescriptor[] {
  return entries.filter((entry) => TARGET_KINDS[target].has(entry.kind))
}

export function buildConfig(target: BuildTarget) {
  const entry = target === "server" ? "virtual:pumped/entry-server" : "virtual:pumped/entry-cli"

  return {
    build: {
      ssr: true as const,
      outDir: "dist",
      emptyOutDir: false,
      rollupOptions: {
        input: entry,
        output: { entryFileNames: `${target}.mjs` },
      },
    },
  }
}
