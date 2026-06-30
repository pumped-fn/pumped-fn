import { readFileSync } from "node:fs"
import { join, basename } from "node:path"

const pkgRoot = join(import.meta.dirname, "..")

export interface DocBlock {
  id: string
  source: string
  file: string
  kind: "md" | "tsdoc" | "cli"
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

function extractCliCategoryContent(text: string): Map<string, string> {
  const lines = text.split("\n")
  const categoryKeyRe = /^  (?:"([\w-]+)"|([\w-]+)): \{$/
  const result = new Map<string, string>()

  let currentCat: string | null = null
  let inContent = false
  let contentLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const catMatch = categoryKeyRe.exec(line)
    if (catMatch && !inContent) {
      currentCat = catMatch[1] ?? catMatch[2] ?? null
      continue
    }
    if (currentCat && !inContent && /^    content: `/.test(line)) {
      inContent = true
      const firstLine = line.slice("    content: `".length)
      if (firstLine.endsWith("`,")) {
        result.set(currentCat, firstLine.slice(0, -2))
        inContent = false
        currentCat = null
        contentLines = []
      } else {
        contentLines = [firstLine]
      }
      continue
    }
    if (inContent) {
      if (line.endsWith("`,") || line.endsWith("`,\r")) {
        contentLines.push(line.endsWith("\r") ? line.slice(0, -3) : line.slice(0, -2))
        result.set(currentCat!, contentLines.join("\n"))
        inContent = false
        contentLines = []
        currentCat = null
        continue
      }
      contentLines.push(line)
    }
  }

  return result
}

function isRunnableGroup(lines: string[]): boolean {
  const first = lines[0]?.trim() ?? ""
  if (!first) return false
  if (/→/.test(lines.join("\n"))) return false
  if (!/^(import\s|const\s|let\s|var\s|async\s+function|async\s+\()/.test(first)) return false
  return true
}

function extractCliBlocks(): DocBlock[] {
  const filePath = join(pkgRoot, "src", "cli.ts")
  const text = readFileSync(filePath, "utf-8")
  const blocks: DocBlock[] = []

  const categoryContents = extractCliCategoryContent(text)

  for (const [category, content] of categoryContents) {
    if (category === "tanstack-start") continue

    const contentLines = content.split("\n")
    let groupLines: string[] = []
    let n = 0

    const flush = () => {
      if (groupLines.length > 0 && isRunnableGroup(groupLines)) {
        n++
        blocks.push({
          id: `cli.ts#${category}-${n}`,
          source: rewriteImports(groupLines.join("\n").trimEnd()),
          file: filePath,
          kind: "cli",
        })
      }
      groupLines = []
    }

    for (const line of contentLines) {
      const isIndented = /^  /.test(line) && line.trim().length > 0
      if (isIndented) {
        groupLines.push(line.slice(2))
      } else {
        flush()
      }
    }
    flush()
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
    ...extractCliBlocks(),
  ]
}
