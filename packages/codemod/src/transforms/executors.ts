import type { Collection, JSCodeshift } from "jscodeshift"

export function transformProvide(
  j: JSCodeshift,
  root: Collection
): void {
  root
    .find(j.CallExpression, {
      callee: { type: "Identifier", name: "provide" }
    })
    .forEach((path) => {
      const callExpr = path.node
      const args = callExpr.arguments

      if (args.length === 0) return

      const factoryArg = args[0]
      if (factoryArg.type !== "ArrowFunctionExpression" && factoryArg.type !== "FunctionExpression") {
        return
      }

      const param = factoryArg.params[0]
      if (param && param.type === "Identifier") {
        const oldName = param.name
        if (oldName === "ctl" || oldName === "controller") {
          param.name = "ctx"

          j(factoryArg)
            .find(j.Identifier, { name: oldName })
            .forEach((identPath) => {
              let currentPath = identPath.parent
              let isShadowed = false

              while (currentPath && currentPath.value !== factoryArg) {
                const node = currentPath.value
                if ((node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") &&
                    node.params.some(p => p.type === "Identifier" && p.name === oldName)) {
                  isShadowed = true
                  break
                }
                currentPath = currentPath.parent
              }

              if (!isShadowed) {
                identPath.node.name = "ctx"
              }
            })
        }
      }

      const properties: Array<
        ReturnType<typeof j.property>
      > = []

      properties.push(
        j.property(
          "init",
          j.identifier("factory"),
          factoryArg
        )
      )

      if (args.length > 1) {
        const tagArgs = args.slice(1)
        properties.push(
          j.property(
            "init",
            j.identifier("tags"),
            j.arrayExpression(tagArgs)
          )
        )
      }

      const objectExpr = j.objectExpression(properties)

      callExpr.callee = j.identifier("atom")
      callExpr.arguments = [objectExpr]
    })
}
