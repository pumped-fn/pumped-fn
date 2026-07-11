import react from "@vitejs/plugin-react"
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin } from "vite"

const compareDir = dirname(fileURLToPath(import.meta.url))
const liteDir = join(compareDir, "../../pkg/core/lite")
const excludedLibs = /^lib\.(webworker|scripthost)/

function resolvePackageDir(name: string, fromDir: string): string {
  let dir = fromDir
  while (true) {
    const candidate = join(dir, "node_modules", name)
    try {
      statSync(join(candidate, "package.json"))
      return realpathSync(candidate)
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`cannot resolve ${name} from ${fromDir}`)
      dir = parent
    }
  }
}

function collectPackage(files: Record<string, string>, name: string, packageDir: string): void {
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry !== "node_modules") walk(full)
      } else if (/\.d\.(ts|mts|cts)$/.test(entry) || entry === "package.json") {
        files[`/node_modules/${name}/${relative(packageDir, full).replaceAll("\\", "/")}`] = readFileSync(full, "utf8")
      }
    }
  }
  walk(packageDir)
}

function buildEditorTypesPayload(): string {
  const libs: Record<string, string> = {}
  const typescriptLib = dirname(resolvePackageDir("typescript", compareDir)) + "/typescript/lib"
  for (const entry of readdirSync(typescriptLib)) {
    if (entry.startsWith("lib.") && entry.endsWith(".d.ts") && !excludedLibs.test(entry)) {
      libs[`/${entry}`] = readFileSync(join(typescriptLib, entry), "utf8")
    }
  }
  const files: Record<string, string> = {}
  for (const name of ["effect", "awilix", "inversify", "reflect-metadata"]) {
    collectPackage(files, name, resolvePackageDir(name, compareDir))
  }
  const vitestDir = resolvePackageDir("vitest", compareDir)
  collectPackage(files, "vitest", vitestDir)
  for (const name of ["@vitest/expect", "@vitest/runner", "@vitest/spy", "@vitest/utils"]) {
    collectPackage(files, name, resolvePackageDir(name, vitestDir))
  }
  files["/node_modules/@pumped-fn/lite/package.json"] = readFileSync(join(liteDir, "package.json"), "utf8")
  files["/node_modules/@pumped-fn/lite/dist/index.d.mts"] = readFileSync(join(liteDir, "dist/index.d.mts"), "utf8")
  files["/node_modules/@pumped-fn/lite/dist/index.d.cts"] = readFileSync(join(liteDir, "dist/index.d.cts"), "utf8")
  return JSON.stringify({ libs, files })
}

function editorTypes(): Plugin {
  const virtualId = "virtual:editor-types"
  const resolvedId = `\0${virtualId}`
  let payload: string | undefined
  return {
    name: "compare-editor-types",
    resolveId(id) {
      return id === virtualId ? resolvedId : undefined
    },
    load(id) {
      if (id !== resolvedId) return undefined
      payload ??= buildEditorTypesPayload()
      return `export default ${payload}`
    },
  }
}

export default defineConfig({
  base: process.env.PUMPED_COMPARE_BASE_PATH ?? "/",
  plugins: [react(), editorTypes()],
  resolve: {
    alias: {
      "@pumped-fn/lite": join(liteDir, "src/index.ts"),
    },
  },
  server: {
    port: 4178,
  },
  worker: {
    format: "es",
    plugins: () => [editorTypes()],
  },
})
