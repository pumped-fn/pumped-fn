import type { Lite } from "@pumped-fn/lite"
import { entrySpec } from "./entry"
import { appPick, enabled, mounts } from "./hosts/host"
import type { Manifest } from "./runtime/manifest"
import { command, route, schedule, workflow } from "./tags"

export type BuildTarget = "server" | "cli"
export type HostName = "http" | "cron" | "workflow" | "cli"

/** Entries and hosts one build target needs, computed from entry tags. */
export interface TargetPlan {
  files: string[]
  hosts: HostName[]
}

const TARGET_SELECTORS: Record<BuildTarget, readonly { host: HostName; selector: Lite.Tag<any, false> }[]> = {
  server: [
    { host: "http", selector: route },
    { host: "cron", selector: schedule },
    { host: "workflow", selector: workflow },
  ],
  cli: [{ host: "cli", selector: command }],
}

export function planTarget(manifest: Manifest, target: BuildTarget): TargetPlan {
  const pick = appPick(manifest.app)
  const files: string[] = []
  const hosts = new Set<HostName>()
  for (const item of manifest.entries) {
    const spec = entrySpec(item.entry)
    if (!enabled(spec.attributes, pick)) continue
    let included = false
    for (const { host, selector } of TARGET_SELECTORS[target]) {
      if (mounts(spec.tags, selector, pick).length === 0) continue
      hosts.add(host)
      included = true
    }
    if (included) files.push(item.file)
  }
  return { files, hosts: [...hosts] }
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
 * Builds the manifest alone so `pumped graph` and the build census can read it. Declares no SSR
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
