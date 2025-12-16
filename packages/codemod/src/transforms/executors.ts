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
      if (!factoryArg || (factoryArg.type !== "ArrowFunctionExpression" && factoryArg.type !== "FunctionExpression")) {
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
                    node.params.some((p: any) => p.type === "Identifier" && p.name === oldName)) {
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

export function transformDerive(
  j: JSCodeshift,
  root: Collection
): void {
  root
    .find(j.CallExpression, {
      callee: { type: "Identifier", name: "derive" }
    })
    .forEach((path) => {
      const callExpr = path.node
      const args = callExpr.arguments

      if (args.length < 2) return

      const depsArg = args[0]
      const factoryArg = args[1]

      if (!factoryArg || (factoryArg.type !== "ArrowFunctionExpression" && factoryArg.type !== "FunctionExpression")) {
        return
      }

      if (!depsArg) return

      let depsObject: ReturnType<typeof j.objectExpression> | null = null

      if (depsArg.type === "ArrayExpression") {
        const firstParam = factoryArg.params[0]
        if (!firstParam || firstParam.type !== "ArrayPattern") {
          return
        }

        const depKeys: Array<string> = []
        for (const element of firstParam.elements) {
          if (!element || element.type !== "Identifier") {
            return
          }
          depKeys.push(element.name)
        }

        const depsProperties = depsArg.elements.map((depExpr, idx) => {
          if (!depExpr) return null
          const key = depKeys[idx]
          if (!key) return null
          return j.property(
            "init",
            j.identifier(key),
            depExpr as any
          )
        }).filter((p): p is ReturnType<typeof j.property> => p !== null)

        depsObject = j.objectExpression(depsProperties)
      } else if (depsArg.type === "ObjectExpression") {
        depsObject = depsArg
      } else {
        return
      }

      const secondParam = factoryArg.params[1]
      if (secondParam && secondParam.type === "Identifier") {
        const oldName = secondParam.name
        if (oldName === "ctl" || oldName === "controller") {
          secondParam.name = "ctx"

          j(factoryArg)
            .find(j.Identifier, { name: oldName })
            .forEach((identPath) => {
              let currentPath = identPath.parent
              let isShadowed = false

              while (currentPath && currentPath.value !== factoryArg) {
                const node = currentPath.value
                if ((node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") &&
                    node.params.some((p: any) => p.type === "Identifier" && p.name === oldName)) {
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

      const firstParam = factoryArg.params[0]
      if (!firstParam) return

      let newDepsParam: ReturnType<typeof j.objectPattern>

      if (firstParam.type === "ArrayPattern") {
        const properties = firstParam.elements.map((element) => {
          if (!element || element.type !== "Identifier") {
            return null
          }
          const prop = j.property.from({
            kind: "init",
            key: j.identifier(element.name),
            value: element,
            shorthand: true
          })
          return prop
        }).filter((p): p is ReturnType<typeof j.property> => p !== null)

        newDepsParam = j.objectPattern(properties)
      } else if (firstParam.type === "ObjectPattern") {
        newDepsParam = firstParam
      } else {
        return
      }

      const newSecondParam = secondParam || j.identifier("ctx")
      factoryArg.params = [newSecondParam, newDepsParam]

      const properties: Array<
        ReturnType<typeof j.property>
      > = []

      properties.push(
        j.property(
          "init",
          j.identifier("deps"),
          depsObject
        )
      )

      properties.push(
        j.property(
          "init",
          j.identifier("factory"),
          factoryArg
        )
      )

      if (args.length > 2) {
        const tagArgs = args.slice(2)
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
