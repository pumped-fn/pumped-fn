import type { Collection, JSCodeshift, ASTPath } from "jscodeshift"

export function transformControllerMethods(
  j: JSCodeshift,
  root: Collection
): void {
  function processFunction(path: ASTPath) {
    const fn = path.node
    const param = fn.params[0]

    if (!param || param.type !== "Identifier" || param.name !== "ctx") {
      return
    }

    let currentPath: ASTPath | null = path.parent
    while (currentPath) {
      const node = currentPath.value
      if ((node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") &&
          node.params.some(p => p.type === "Identifier" && p.name === "ctx")) {
        return
      }
      currentPath = currentPath.parent
    }

    j(fn)
      .find(j.CallExpression, {
        callee: {
          type: "MemberExpression",
          object: { type: "Identifier", name: "ctx" }
        }
      })
      .forEach((callPath) => {
        const memberExpr = callPath.node.callee
        if (memberExpr.type !== "MemberExpression") return
        if (memberExpr.property.type !== "Identifier") return

        let currentPath: ASTPath | null = callPath.parent
        let isShadowed = false

        while (currentPath && currentPath.value !== fn) {
          const node = currentPath.value
          if ((node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") &&
              node.params.some(p => p.type === "Identifier" && p.name === "ctx")) {
            isShadowed = true
            break
          }
          currentPath = currentPath.parent
        }

        if (isShadowed) return

        const methodName = memberExpr.property.name

        if (methodName === "release" || methodName === "reload") {
          memberExpr.property.name = "invalidate"
        }
      })
  }

  root.find(j.ArrowFunctionExpression).forEach(processFunction)
  root.find(j.FunctionExpression).forEach(processFunction)
}
