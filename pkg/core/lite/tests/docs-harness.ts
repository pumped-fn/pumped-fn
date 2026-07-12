import { readFileSync } from "node:fs"
import { join, basename } from "node:path"

const pkgRoot = join(import.meta.dirname, "..")

export interface DocBlock {
  id: string
  source: string
  file: string
  kind: "md" | "tsdoc"
}

function rewriteImports(source: string): string {
  return source
    .replace(/from\s+"@pumped-fn\/lite"/g, 'from "../../src/index"')
    .replace(/from\s+'@pumped-fn\/lite'/g, "from '../../src/index'")
}

function extractMdBlocks(filePath: string): DocBlock[] {
  const text = readFileSync(filePath, "utf-8")
  const base = basename(filePath)
  const blocks: DocBlock[] = []
  const fence = /^```(typescript|ts)\n([\s\S]*?)^```/gm
  let match: RegExpExecArray | null
  let n = 0
  while ((match = fence.exec(text)) !== null) {
    n++
    blocks.push({
      id: `${base}#${n}`,
      source: rewriteImports(match[2]!.trimEnd()),
      file: filePath,
      kind: "md",
    })
  }
  return blocks
}

function extractTsdocBlocks(filePath: string): DocBlock[] {
  const text = readFileSync(filePath, "utf-8")
  const base = basename(filePath)
  const blocks: DocBlock[] = []
  const commentRe = /\/\*\*([\s\S]*?)\*\//g
  let match: RegExpExecArray | null
  let n = 0
  while ((match = commentRe.exec(text)) !== null) {
    const body = match[1]!
    const fenceRe = /```typescript\n([\s\S]*?)```|```ts\n([\s\S]*?)```/g
    let fence: RegExpExecArray | null
    while ((fence = fenceRe.exec(body)) !== null) {
      const raw = (fence[1] ?? fence[2]!)
        .split("\n")
        .map((line) => line.replace(/^\s*\*\s?/, ""))
        .join("\n")
        .trimEnd()
      n++
      blocks.push({
        id: `${base}#${n}`,
        source: rewriteImports(raw),
        file: filePath,
        kind: "tsdoc",
      })
    }
  }
  return blocks
}

export function extractDocBlocks(): DocBlock[] {
  const mdFiles = [
    join(pkgRoot, "README.md"),
    join(pkgRoot, "PATTERNS.md"),
    join(pkgRoot, "MIGRATION.md"),
  ]

  const srcFiles = [
    join(pkgRoot, "src", "atom.ts"),
    join(pkgRoot, "src", "flow.ts"),
    join(pkgRoot, "src", "resource.ts"),
    join(pkgRoot, "src", "tag.ts"),
    join(pkgRoot, "src", "preset.ts"),
    join(pkgRoot, "src", "scope.ts"),
    join(pkgRoot, "src", "types.ts"),
  ]

  return [
    ...mdFiles.flatMap(extractMdBlocks),
    ...srcFiles.flatMap(extractTsdocBlocks),
  ]
}
