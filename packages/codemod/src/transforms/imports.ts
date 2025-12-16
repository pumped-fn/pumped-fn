import type { Collection, JSCodeshift } from "jscodeshift"

const VALUE_MAPPINGS: Record<string, string> = {
  provide: "atom",
  derive: "atom",
  tag: "tag",
  tags: "tags",
  createScope: "createScope",
  preset: "preset",
  extension: "extension",
}

const TYPE_MAPPINGS: Record<string, string> = {
  Core: "Lite",
  Tag: "Lite",
}

export function transformImports(
  j: JSCodeshift,
  root: Collection
): { addedController: boolean } {
  root
    .find(j.ImportDeclaration, {
      source: { value: "@pumped-fn/core-next" },
    })
    .forEach((path) => {
      const importDecl = path.node
      if (!importDecl.specifiers) return

      const transformedSpecifiers: Set<string> = new Set()
      const newSpecifiers: typeof importDecl.specifiers = []

      importDecl.specifiers.forEach((specifier) => {
        if (specifier.type === "ImportSpecifier") {
          const importedName =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : (specifier.imported as any).value

          const isTypeImport =
            (specifier as any).importKind === "type" || importDecl.importKind === "type"
          const mappedName = isTypeImport
            ? TYPE_MAPPINGS[importedName]
            : VALUE_MAPPINGS[importedName]

          if (mappedName && !transformedSpecifiers.has(mappedName)) {
            transformedSpecifiers.add(mappedName)
            const newSpec = j.importSpecifier(j.identifier(mappedName))
            if (isTypeImport && importDecl.importKind !== "type") {
              (newSpec as any).importKind = "type"
            }
            newSpecifiers.push(newSpec)
          }
        }
      })

      importDecl.specifiers = newSpecifiers

      importDecl.source = j.stringLiteral("@pumped-fn/lite")
    })

  return { addedController: false }
}
