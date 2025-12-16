import type { API, FileInfo, Options } from "jscodeshift"
import { EdgeCaseCollector } from "../report/collector"
import { transformImports } from "./imports"
import { transformProvide, transformDerive } from "./executors"
import { transformControllerMethods } from "./controller-methods"
import { transformAccessors } from "./accessors"
import { transformTypes } from "./types"

const collector = new EdgeCaseCollector()

export function transform(
  file: FileInfo,
  api: API,
  options: Options
): string | undefined {
  const j = api.jscodeshift
  const source = file.source

  if (!source.includes("@pumped-fn/core-next")) {
    return undefined
  }

  const root = j(source)

  const { addedController: controllerFromImports } = transformImports(j, root)

  transformProvide(j, root)
  transformDerive(j, root)
  transformControllerMethods(j, root)

  const accessorEdgeCases = transformAccessors(j, root, file.path)
  for (const edgeCase of accessorEdgeCases) {
    collector.add(edgeCase)
  }

  const typeEdgeCases = transformTypes(j, root, file.path)
  for (const edgeCase of typeEdgeCases) {
    collector.add(edgeCase)
  }

  const hasControllerUsage = root
    .find(j.CallExpression, {
      callee: { type: "Identifier", name: "controller" }
    })
    .size() > 0

  if (hasControllerUsage && !controllerFromImports) {
    root
      .find(j.ImportDeclaration, {
        source: { value: "@pumped-fn/lite" }
      })
      .forEach((path) => {
        const importDecl = path.node
        if (!importDecl.specifiers) return
        if (importDecl.importKind === "type") return

        const hasController = importDecl.specifiers.some(
          (spec) =>
            spec.type === "ImportSpecifier" &&
            spec.imported.type === "Identifier" &&
            spec.imported.name === "controller"
        )

        if (!hasController) {
          importDecl.specifiers.push(
            j.importSpecifier(j.identifier("controller"))
          )
        }
      })
  }

  collector.recordFile()

  return root.toSource({ quote: "double" })
}

export function getCollector(): EdgeCaseCollector {
  return collector
}

export default transform
