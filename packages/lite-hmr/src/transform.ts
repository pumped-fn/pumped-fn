import { parse } from "acorn"
import { walk } from "estree-walker"
import MagicString from "magic-string"
import type { Node } from "estree"

interface TransformResult {
  code: string
  map: ReturnType<MagicString["generateMap"]>
}

export function transformAtoms(
  code: string,
  filePath: string
): TransformResult | null {
  let ast: Node

  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    }) as Node
  } catch {
    return null
  }

  const s = new MagicString(code)
  let needsImport = false

  walk(ast, {
    enter(node: Node, parent: Node | null) {
      if (
        node.type === "VariableDeclarator" &&
        node.init &&
        node.init.type === "CallExpression" &&
        node.init.callee.type === "Identifier" &&
        node.init.callee.name === "atom" &&
        node.id.type === "Identifier" &&
        parent?.type === "VariableDeclaration"
      ) {
        const initNode = node.init as Node & {
          start: number
          end: number
          loc: { start: { line: number; column: number } }
        }

        const key = `${filePath}:${initNode.loc.start.line}:${initNode.loc.start.column}`
        needsImport = true

        s.prependLeft(initNode.start, `__hmr_register('${key}', `)
        s.appendRight(initNode.end, ")")
      }
    },
  })

  if (!needsImport) {
    return null
  }

  s.prepend(`import { __hmr_register } from '@pumped-fn/lite-hmr/runtime';\n`)

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true }),
  }
}
