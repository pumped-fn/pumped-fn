import ts from "typescript"
import MagicString from "magic-string"
import type { AtomMeta, EdgeMeta, EdgeVia, HandleKind, HandleMeta, IssueCode, IssueMeta, ModuleMeta } from "./types"

interface TransformResult {
  code: string
  map: ReturnType<MagicString["generateMap"]>
  meta: ModuleMeta
}

interface ReadResult {
  meta: ModuleMeta
  atomSpans: readonly AtomSpan[]
}

interface GraphMeta {
  edges: EdgeMeta[]
  issues: IssueMeta[]
}

interface AtomSpan {
  key: string
  start: number
  end: number
}

interface UnsupportedAtomBinding {
  name: string
  source: string
}

interface FoundHandle {
  handle: HandleMeta
  value: ts.CallExpression
}

interface ImportRef {
  name: string
  source: string
}

type LiteBinding = HandleKind | "controller" | "namespace" | "tags"

interface DepTarget {
  name: string
  via: EdgeVia
}

export function readLite(code: string, filePath: string): ModuleMeta | null {
  return readLiteResult(code, filePath)?.meta ?? null
}

function readLiteResult(code: string, filePath: string): ReadResult | null {
  const file = clean(filePath)
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, scriptKind(file))
  const bindings = liteBindings(source)
  const unsupportedAtoms = unsupportedAtomBindings(source)
  const handles: HandleMeta[] = []
  const atoms: AtomMeta[] = []
  const atomSpans: AtomSpan[] = []
  const found: FoundHandle[] = []

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const value = liteCall(declaration.initializer, bindings)
      if (!value) continue
      const kind = callKind(value, bindings)
      if (!kind) continue
      const start = value.getStart(source)
      const loc = source.getLineAndCharacterOfPosition(start)
      const key = `${file}:${declaration.name.text}`
      const handle = {
        key,
        kind,
        name: declaration.name.text,
        file,
        line: loc.line + 1,
        column: loc.character,
      } satisfies HandleMeta
      handles.push(handle)
      found.push({ handle, value })
      if (kind === "atom") {
        atoms.push({ ...handle, kind })
        atomSpans.push({
          key,
          start,
          end: value.end,
        })
      }
    }
  }

  const handlesByName = new Map(handles.map((handle) => [handle.name, handle]))
  const imports = importBindings(source)
  const graph = found.reduce<GraphMeta>((meta, item) => {
    const next = graphMeta(file, source, item, handlesByName, imports, bindings)
    meta.edges.push(...next.edges)
    meta.issues.push(...next.issues)
    return meta
  }, { edges: [], issues: [] })
  graph.issues.push(...untrackedAtoms(file, source, bindings, unsupportedAtoms, new Set(atomSpans.map((atom) => atom.start))))

  if (handles.length === 0 && graph.issues.length === 0) return null

  return {
    meta: {
      id: file,
      handles,
      atoms,
      edges: graph.edges,
      issues: graph.issues,
    },
    atomSpans,
  }
}

export function transformAtoms(
  code: string,
  filePath: string
): TransformResult | null {
  const result = readLiteResult(code, filePath)
  if (!result) return null

  const s = new MagicString(code)
  for (const atom of result.atomSpans) {
    s.prependLeft(atom.start, `__hmr_register(${JSON.stringify(atom.key)}, `)
    s.appendRight(atom.end, ")")
  }

  if (result.meta.atoms.length > 0) {
    s.prepend(`import { __hmr_register } from '@pumped-fn/lite-hmr/runtime';\n`)
  }

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true }),
    meta: result.meta,
  }
}

function liteBindings(source: ts.SourceFile): ReadonlyMap<string, LiteBinding> {
  const bindings = new Map<string, LiteBinding>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.moduleSpecifier.text !== "@pumped-fn/lite") continue
    if (statement.importClause?.isTypeOnly) continue
    const namedBindings = statement.importClause?.namedBindings
    if (!namedBindings) continue
    if (ts.isNamespaceImport(namedBindings)) {
      bindings.set(namedBindings.name.text, "namespace")
      continue
    }
    if (!ts.isNamedImports(namedBindings)) continue
    for (const specifier of namedBindings.elements) {
      if (specifier.isTypeOnly) continue
      const imported = (specifier.propertyName ?? specifier.name).text
      const kind = liteBinding(imported)
      if (kind) bindings.set(specifier.name.text, kind)
    }
  }
  return bindings
}

function unsupportedAtomBindings(source: ts.SourceFile): readonly UnsupportedAtomBinding[] {
  const bindings: UnsupportedAtomBinding[] = []
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.moduleSpecifier.text === "@pumped-fn/lite") continue
    if (!localSource(statement.moduleSpecifier.text)) continue
    if (statement.importClause?.isTypeOnly) continue
    const namedBindings = statement.importClause?.namedBindings
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue
    for (const specifier of namedBindings.elements) {
      if (specifier.isTypeOnly) continue
      if ((specifier.propertyName ?? specifier.name).text === "atom") {
        bindings.push({ name: specifier.name.text, source: statement.moduleSpecifier.text })
      }
    }
  }
  return bindings
}

function importBindings(source: ts.SourceFile): ReadonlyMap<string, ImportRef> {
  const bindings = new Map<string, ImportRef>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (statement.importClause?.isTypeOnly) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.importClause?.name) {
      bindings.set(statement.importClause.name.text, {
        name: "default",
        source: statement.moduleSpecifier.text,
      })
    }
    const namedBindings = statement.importClause?.namedBindings
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue
    for (const specifier of namedBindings.elements) {
      if (specifier.isTypeOnly) continue
      bindings.set(specifier.name.text, {
        name: (specifier.propertyName ?? specifier.name).text,
        source: statement.moduleSpecifier.text,
      })
    }
  }
  return bindings
}

function liteCall(value: ts.Expression, bindings: ReadonlyMap<string, LiteBinding>): ts.CallExpression | undefined {
  const expr = unwrap(value)
  if (!ts.isCallExpression(expr)) return undefined
  return handleKind(exprBinding(expr.expression, bindings)) ? expr : undefined
}

function callKind(value: ts.CallExpression, bindings: ReadonlyMap<string, LiteBinding>): HandleKind | undefined {
  return handleKind(exprBinding(value.expression, bindings))
}

function graphMeta(
  file: string,
  source: ts.SourceFile,
  item: FoundHandle,
  handles: ReadonlyMap<string, HandleMeta>,
  imports: ReadonlyMap<string, ImportRef>,
  bindings: ReadonlyMap<string, LiteBinding>
): GraphMeta {
  const config = objectArg(item.value)
  if (!config) return { edges: [], issues: [] }
  const deps = objectProperty(config, "deps")
  const depsValue = deps ? unwrap(deps.initializer) : undefined
  if (!depsValue || !ts.isObjectLiteralExpression(depsValue)) return { edges: [], issues: [] }
  const edges: EdgeMeta[] = []
  const issues: IssueMeta[] = []

  for (const property of depsValue.properties) {
    const target = edgeTarget(property, bindings)
    if (!target) {
      const issue = dynamicIssue(file, source, item, property)
      if (issue) issues.push(issue)
      continue
    }
    const known = handles.get(target.name)
    const ref = imports.get(target.name)
    const start = target.value.getStart(source)
    const loc = source.getLineAndCharacterOfPosition(start)

    if (!known && !ref) {
      issues.push(issueMeta("unknown-dep", file, source, item, target.slot, target.value, target.name))
    }

    edges.push({
      from: item.handle.key,
      to: known?.key ?? (ref ? `${ref.source}:${ref.name}` : `${file}:${target.name}`),
      fromName: item.handle.name,
      toName: ref?.name ?? target.name,
      slot: target.slot,
      file,
      line: loc.line + 1,
      column: loc.character,
      via: target.via,
      ...(known ? { toKind: known.kind } : {}),
      ...(ref ? { importSource: ref.source } : {}),
    })
  }

  return { edges, issues }
}

function dynamicIssue(
  file: string,
  source: ts.SourceFile,
  item: FoundHandle,
  property: ts.ObjectLiteralElementLike
): IssueMeta | undefined {
  if (ts.isShorthandPropertyAssignment(property) && property.objectAssignmentInitializer) {
    return issueMeta(
      "dynamic-dep",
      file,
      source,
      item,
      property.name.text,
      property.name,
      sourceText(source, property)
    )
  }
  if (ts.isPropertyAssignment(property)) {
    return issueMeta(
      "dynamic-dep",
      file,
      source,
      item,
      propertyName(property.name) ?? property.name.getText(source),
      property.initializer,
      sourceText(source, property.initializer)
    )
  }
  if (ts.isSpreadAssignment(property)) {
    return issueMeta(
      "dynamic-dep",
      file,
      source,
      item,
      "...",
      property.expression,
      sourceText(source, property.expression)
    )
  }
  return undefined
}

function issueMeta(
  code: IssueCode,
  file: string,
  source: ts.SourceFile,
  item: FoundHandle,
  slot: string,
  value: ts.Node,
  target: string
): IssueMeta {
  const start = value.getStart(source)
  const loc = source.getLineAndCharacterOfPosition(start)
  return {
    code,
    fromName: item.handle.name,
    slot,
    file,
    line: loc.line + 1,
    column: loc.character,
    target,
  }
}

function moduleIssueMeta(
  code: IssueCode,
  file: string,
  source: ts.SourceFile,
  value: ts.Node,
  target: string,
  fromName = "(module)"
): IssueMeta {
  const start = value.getStart(source)
  const loc = source.getLineAndCharacterOfPosition(start)
  return {
    code,
    fromName,
    slot: "atom",
    file,
    line: loc.line + 1,
    column: loc.character,
    target,
  }
}

function untrackedAtoms(
  file: string,
  source: ts.SourceFile,
  bindings: ReadonlyMap<string, LiteBinding>,
  unsupportedAtoms: readonly UnsupportedAtomBinding[],
  wrapped: ReadonlySet<number>
): IssueMeta[] {
  const issues: IssueMeta[] = []
  const unsupported = new Map(unsupportedAtoms.map((binding) => [binding.name, binding.source]))

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const start = node.getStart(source)
      const binding = exprBinding(node.expression, bindings)
      const unsupportedSource = ts.isIdentifier(node.expression) ? unsupported.get(node.expression.text) : undefined
      const shadowed = ts.isIdentifier(node.expression) && isShadowed(node.expression)
      if (binding === "atom" && !wrapped.has(start) && !shadowed) {
        issues.push(moduleIssueMeta("untracked-atom", file, source, node, sourceText(source, node), declarationName(node)))
      } else if (unsupportedSource && !shadowed) {
        issues.push(moduleIssueMeta("untracked-atom", file, source, node, `${sourceText(source, node)} from ${unsupportedSource}`, declarationName(node)))
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return issues
}

function declarationName(node: ts.Node): string {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text
  }
  return "(module)"
}

function isShadowed(node: ts.Identifier): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent) && parent.parameters.some((param) => ts.isIdentifier(param.name) && param.name.text === node.text)) return true
    if ((ts.isBlock(parent) || ts.isSourceFile(parent) || ts.isModuleBlock(parent)) && declaresName(parent.statements, node.text, node.pos)) return true
  }
  return false
}

function declaresName(statements: ts.NodeArray<ts.Statement>, name: string, before: number): boolean {
  return statements.some((statement) => statement.pos < before && declares(statement, name))
}

function declares(statement: ts.Statement, name: string): boolean {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name)
  }
  return (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
    statement.name?.text === name
  )
}

function localSource(source: string): boolean {
  return source.startsWith(".") || source.startsWith("/") || source.startsWith("@/") || source.startsWith("~/")
}

function edgeTarget(
  property: ts.ObjectLiteralElementLike,
  bindings: ReadonlyMap<string, LiteBinding>
): (DepTarget & { slot: string; value: ts.Expression }) | undefined {
  if (ts.isShorthandPropertyAssignment(property)) {
    if (property.objectAssignmentInitializer) return undefined
    return {
      name: property.name.text,
      slot: property.name.text,
      value: property.name,
      via: "direct",
    }
  }
  if (!ts.isPropertyAssignment(property)) return undefined
  const slot = propertyName(property.name)
  if (!slot) return undefined
  const target = depTarget(property.initializer, bindings)
  return target ? { ...target, slot, value: property.initializer } : undefined
}

function objectArg(value: ts.CallExpression): ts.ObjectLiteralExpression | undefined {
  const arg = value.arguments[0]
  if (!arg) return undefined
  const expr = unwrap(arg)
  return ts.isObjectLiteralExpression(expr) ? expr : undefined
}

function objectProperty(value: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    if (propertyName(property.name) === name) return property
  }
  return undefined
}

function depTarget(value: ts.Expression, bindings: ReadonlyMap<string, LiteBinding>): DepTarget | undefined {
  const expr = unwrap(value)
  if (ts.isIdentifier(expr)) return { name: expr.text, via: "direct" }
  if (!ts.isCallExpression(expr)) return undefined
  if (exprBinding(expr.expression, bindings) === "controller") {
    return identifierArg(expr, "controller")
  }
  if (
    ts.isPropertyAccessExpression(expr.expression) &&
    exprBinding(expr.expression.expression, bindings) === "tags" &&
    (expr.expression.name.text === "required" || expr.expression.name.text === "optional" || expr.expression.name.text === "all")
  ) {
    return identifierArg(expr, "tag")
  }
  return undefined
}

function identifierArg(value: ts.CallExpression, via: EdgeVia): DepTarget | undefined {
  const arg = value.arguments[0]
  if (!arg) return undefined
  const expr = unwrap(arg)
  return ts.isIdentifier(expr) ? { name: expr.text, via } : undefined
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function exprBinding(value: ts.Expression, bindings: ReadonlyMap<string, LiteBinding>): LiteBinding | undefined {
  if (ts.isIdentifier(value)) return bindings.get(value.text)
  if (
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    bindings.get(value.expression.text) === "namespace"
  ) {
    return liteBinding(value.name.text)
  }
  return undefined
}

function sourceText(source: ts.SourceFile, value: ts.Node): string {
  return value.getText(source).replace(/\s+/g, " ")
}

function liteBinding(name: string): LiteBinding | undefined {
  if (name === "atom" || name === "flow" || name === "resource" || name === "tag") return name
  if (name === "controller" || name === "tags") return name
  return undefined
}

function handleKind(name: LiteBinding | undefined): HandleKind | undefined {
  if (name === "atom" || name === "flow" || name === "resource" || name === "tag") return name
  return undefined
}

function unwrap(value: ts.Expression): ts.Expression {
  if (ts.isAsExpression(value) || ts.isTypeAssertionExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value) || ts.isNonNullExpression(value)) {
    return unwrap(value.expression)
  }
  return value
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

function clean(id: string): string {
  return id.split("?")[0]!.replace(/\\/g, "/")
}
