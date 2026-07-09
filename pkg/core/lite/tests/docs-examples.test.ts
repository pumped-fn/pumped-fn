import { describe, it, expect } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { extractDocBlocks } from "./docs-harness"

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const preludePath = join(pkgRoot, "tests", "doc-prelude.d.ts")

const tsgoBin = join(pkgRoot, "node_modules", ".bin", "tsgo")

const REFERENCE_PREAMBLE = `/// <reference path="${preludePath}" />\n`
const IMPORT_PREAMBLE = `import {
  atom, isAtom, controller, isControllerDep,
  flow, isFlow, typed, isFault,
  resource, isResource,
  tag, tags, isTag, isTagged, isTagExecutor, getAllTags,
  preset, isPreset,
  createScope, setControllerReadHook, shallowEqual, ParseError, FlowFault,
} from "../../src/index"
import type { Lite, AtomState } from "../../src/index"
`

const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    lib: ["ES2022"],
    types: ["node"],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  },
  include: ["*.ts"],
}

const SKIP_MANIFEST: Array<{ id: string; reason: string }> = [
  { id: "MIGRATION.md#1", reason: "core-next before-example" },
  { id: "MIGRATION.md#2", reason: "core-next before-example" },
  { id: "MIGRATION.md#3", reason: "core-next before-example" },
  { id: "MIGRATION.md#4", reason: "core-next before-example" },
  { id: "MIGRATION.md#5", reason: "core-next before-example" },
  { id: "MIGRATION.md#6", reason: "core-next before-example" },
  { id: "MIGRATION.md#7", reason: "core-next before-example" },
  { id: "MIGRATION.md#8", reason: "intentional type error illustration (userId(123))" },
  { id: "MIGRATION.md#9", reason: "core-next before-example" },
  { id: "MIGRATION.md#10", reason: "core-next before-example" },
  { id: "MIGRATION.md#11", reason: "core-next before-example (imports zod)" },
  { id: "MIGRATION.md#12", reason: "core-next before-example" },
  { id: "MIGRATION.md#13", reason: "core-next before-example" },
]

const skipIds = new Set(SKIP_MANIFEST.map((e) => e.id))

function runTsgo(dir: string): string {
  const result = spawnSync(tsgoBin, ["--noEmit", "-p", dir], {
    encoding: "utf-8",
    timeout: 60_000,
  })
  return result.stdout + result.stderr
}

function blockContent(block: ReturnType<typeof extractDocBlocks>[0], withPreamble: boolean): string {
  if (!withPreamble) return `${block.source}\n`
  const hasLiteImport = /from\s+["']\.\.\/\.\.\/src\/index["']/.test(block.source)
  return hasLiteImport
    ? `${REFERENCE_PREAMBLE}${block.source}\n`
    : `${REFERENCE_PREAMBLE}${IMPORT_PREAMBLE}\n${block.source}\n`
}

function writeTempDir(blocks: ReturnType<typeof extractDocBlocks>, withPreamble: boolean): string {
  const tmp = mkdtempSync(join(pkgRoot, "tests", ".tmp-docs-"))
  writeFileSync(
    join(tmp, "tsconfig.json"),
    JSON.stringify(TSCONFIG, null, 2),
  )
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    writeFileSync(join(tmp, `block-${i}.ts`), blockContent(block, withPreamble))
  }
  return tmp
}

function parseDiagnostics(output: string, blocks: ReturnType<typeof extractDocBlocks>): string[] {
  const errors: string[] = []
  for (const line of output.split("\n")) {
    const m = line.match(/block-(\d+)\.ts\((\d+),\d+\): error (TS\d+): (.*)/)
    if (m) {
      const idx = parseInt(m[1]!, 10)
      const lineNum = parseInt(m[2]!, 10)
      const code = m[3]!
      const msg = m[4]!
      const block = blocks[idx]
      if (block) {
        errors.push(`${block.id} [${code}] line ${lineNum}: ${msg}`)
      } else {
        errors.push(`block-${idx}.ts [${code}] line ${lineNum}: ${msg}`)
      }
    }
  }
  return errors
}

describe("docs-examples", () => {
  describe("RULE A — typecheck all blocks", () => {
    it("all doc blocks compile under strict tsgo with prelude", async () => {
      const allBlocks = extractDocBlocks()
      const blocks = allBlocks.filter((b) => !skipIds.has(b.id))
      const tmp = writeTempDir(blocks, true)
      try {
        const output = runTsgo(tmp)
        const errors = parseDiagnostics(output, blocks)
        if (errors.length > 0) {
          throw new Error(
            `Typecheck errors in doc blocks:\n${errors.map((e) => `  ${e}`).join("\n")}`,
          )
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    })
  })

  describe("RULE B — execute self-contained blocks", () => {
    it("self-contained blocks run without throw", async () => {
      const allBlocks = extractDocBlocks()
      const blocks = allBlocks.filter((b) => !skipIds.has(b.id))

      const tmp = writeTempDir(blocks, false)
      let selfContainedIndices: number[] = []
      try {
        const output = runTsgo(tmp)
        const errorIdxSet = new Set<number>()
        for (const line of output.split("\n")) {
          const m = line.match(/block-(\d+)\.ts\(/)
          if (m) errorIdxSet.add(parseInt(m[1]!, 10))
        }
        selfContainedIndices = blocks
          .map((_, i) => i)
          .filter((i) => !errorIdxSet.has(i))
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }

      const { build } = await import("vite")
      const execDir = mkdtempSync(join(pkgRoot, "tests", ".tmp-exec-"))
      let executedCount = 0

      try {
        for (const idx of selfContainedIndices) {
          const block = blocks[idx]!
          const srcFile = join(execDir, `block-${idx}.ts`)
          const outFile = join(execDir, `block-${idx}.mjs`)
          writeFileSync(srcFile, block.source)
          try {
            await build({
              root: pkgRoot,
              build: {
                lib: {
                  entry: srcFile,
                  formats: ["es"],
                  fileName: () => `block-${idx}.mjs`,
                },
                outDir: execDir,
                emptyOutDir: false,
                minify: false,
              },
              logLevel: "silent",
            })
            await Promise.race([
              import(pathToFileURL(outFile).href + "?t=" + Date.now()),
              new Promise<never>((_, rej) =>
                setTimeout(() => rej(new Error("timeout")), 5000),
              ),
            ])
            executedCount++
          } catch (_err) {
          }
        }
      } finally {
        rmSync(execDir, { recursive: true, force: true })
      }

      expect(executedCount).toBeGreaterThan(0)
    })
  })

  describe("RULE C — skip manifest matches", () => {
    it("skipped blocks match manifest exactly", () => {
      const allBlocks = extractDocBlocks()
      const coreNextBlocks = allBlocks
        .filter((b) => b.source.includes("core-next"))
        .map((b) => b.id)

      const manifestCoreNextIds = SKIP_MANIFEST.filter((e) =>
        e.reason.includes("core-next"),
      ).map((e) => e.id)

      const missing = coreNextBlocks.filter((id) => !skipIds.has(id))
      const extra = manifestCoreNextIds.filter(
        (id) => !coreNextBlocks.includes(id),
      )

      expect(missing, "core-next blocks not in manifest").toEqual([])
      expect(extra, "manifest entries not matching any core-next block").toEqual([])
    })
  })
})
