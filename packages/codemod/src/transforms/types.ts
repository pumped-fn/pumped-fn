import type { Collection, JSCodeshift } from "jscodeshift"
import type { EdgeCase } from "../report/types"

type TypeMapping = {
  newLeft: string
  newRight: string
  warn?: boolean
  skip?: boolean
}

const coreTypeMap: Record<string, TypeMapping> = {
  Executor: { newLeft: "Lite", newRight: "Atom" },
  Controller: { newLeft: "Lite", newRight: "ResolveContext" },
  Accessor: { newLeft: "Lite", newRight: "Controller" },
  Lazy: { newLeft: "Lite", newRight: "ControllerDep", warn: true },
  Reactive: { newLeft: "Lite", newRight: "ControllerDep", warn: true },
  Static: { newLeft: "Core", newRight: "Static", skip: true },
  Preset: { newLeft: "Lite", newRight: "Preset" },
  AnyExecutor: { newLeft: "Lite", newRight: "Atom" },
}

const tagTypeMap: Record<string, TypeMapping> = {
  Tag: { newLeft: "Lite", newRight: "Tag" },
  Tagged: { newLeft: "Lite", newRight: "Tagged" },
  Source: { newLeft: "Lite", newRight: "TagSource" },
}

export function transformTypes(
  j: JSCodeshift,
  root: Collection,
  fileName?: string
): EdgeCase[] {
  const edgeCases: EdgeCase[] = []
  const originalSource = root.toSource()

  root
    .find(j.TSQualifiedName)
    .forEach((path) => {
      const qualifiedName = path.node
      const left = qualifiedName.left
      const right = qualifiedName.right

      if (left.type !== "Identifier") return
      if (right.type !== "Identifier") return

      const leftName = left.name
      const rightName = right.name

      let mapping: TypeMapping | undefined

      if (leftName === "Core") {
        mapping = coreTypeMap[rightName]
      } else if (leftName === "Tag") {
        mapping = tagTypeMap[rightName]
      }

      if (!mapping) return

      if (mapping.skip) {
        const loc = qualifiedName.loc
        const lineNumber = loc?.start.line || 0
        const columnNumber = loc?.start.column || 0

        const lines = originalSource.split("\n")
        const contextLine = lines[lineNumber - 1] || ""

        const surroundingStart = Math.max(0, lineNumber - 3)
        const surroundingEnd = Math.min(lines.length, lineNumber + 2)
        const surrounding = lines.slice(surroundingStart, surroundingEnd)

        edgeCases.push({
          file: fileName || "unknown",
          line: lineNumber,
          column: columnNumber,
          pattern: `${leftName}.${rightName}`,
          category: "type_no_equivalent",
          context: contextLine.trim(),
          surrounding,
          suggestion: "No equivalent in lite - controller() provides lazy behavior by default"
        })
        return
      }

      if (left.type === "Identifier") {
        left.name = mapping.newLeft
      }
      right.name = mapping.newRight

      const typeRef = path.parent.value
      if (typeRef.type === "TSTypeReference" && mapping.newRight === "Atom") {
        if (!typeRef.typeParameters) {
          typeRef.typeParameters = j.tsTypeParameterInstantiation([
            j.tsUnknownKeyword()
          ])
        }
      }
    })

  return edgeCases
}
