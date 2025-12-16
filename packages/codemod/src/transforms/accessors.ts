import type { Collection, JSCodeshift } from "jscodeshift"
import type { EdgeCase } from "../report/types"

export function transformAccessors(
  j: JSCodeshift,
  root: Collection,
  fileName?: string
): EdgeCase[] {
  const edgeCases: EdgeCase[] = []
  const originalSource = root.toSource()

  root
    .find(j.MemberExpression, {
      property: { type: "Identifier" }
    })
    .forEach((path) => {
      const memberExpr = path.node
      const property = memberExpr.property

      if (property.type !== "Identifier") return

      const propertyName = property.name

      if (propertyName === "lazy" || propertyName === "reactive" || propertyName === "static") {
        if (propertyName === "static") {
          const loc = memberExpr.loc
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
            pattern: ".static",
            category: "static_accessor",
            context: contextLine.trim(),
            surrounding,
            suggestion: "lite has no static accessor; controller() provides lazy behavior by default"
          })
        }

        const callExpr = j.callExpression(
          j.identifier("controller"),
          [memberExpr.object]
        )

        j(path).replaceWith(callExpr)
      }
    })

  return edgeCases
}
