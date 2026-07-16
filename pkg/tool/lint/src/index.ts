import { readdir, readFile, stat } from "node:fs/promises"
import { basename, extname, resolve } from "node:path"
import ts from "typescript"

export type RuleId =
  | "pumped/config-via-tags"
  | "pumped/no-ambient-io-outside-boundary"
  | "pumped/no-ctx-argument"
  | "pumped/no-definition-handle-suffix"
  | "pumped/no-direct-flow-composition"
  | "pumped/no-explicit-atom-type-argument"
  | "pumped/no-handle-spread"
  | "pumped/no-handle-factory"
  | "pumped/no-hidden-exec-dependencies"
  | "pumped/no-implicit-tag-read"
  | "pumped/no-internal-example-label"
  | "pumped/no-immediate-return-binding"
  | "pumped/no-jsdom-backend"
  | "pumped/no-module-mocks"
  | "pumped/no-module-state"
  | "pumped/no-naked-globals"
  | "pumped/no-render-outside-browser-test"
  | "pumped/no-react-local-state"
  | "pumped/no-react-manual-execution-context"
  | "pumped/no-react-use-execution-context"
  | "pumped/no-react-use-scope"
  | "pumped/no-scope-argument"
  | "pumped/no-scope-reach"
  | "pumped/no-shared-scope-factory"
  | "pumped/no-swallowed-error"
  | "pumped/no-test-only-branches"
  | "pumped/no-unattributed-await"
  | "pumped/no-untyped-throw"
  | "pumped/prefer-destructured-deps"

export type Severity = "error" | "warn"

/** Identifies one rule finding at an exact source location. */
export interface Diagnostic {
  ruleId: RuleId
  severity: Severity
  filePath: string
  line: number
  column: number
  message: string
}

/** Collects lint diagnostics and the number of files inspected. */
export interface ScanResult {
  diagnostics: Diagnostic[]
  filesScanned: number
}

/**
 * Per-rule config. Rules with no config accept no key. `allowImplicit` and
 * `allowGlobals` list identifiers that are exempt from their rule's checks
 * (tag labels for no-implicit-tag-read, global names for no-naked-globals).
 * `allowBuiltins` lists builtin error constructor names exempt from
 * no-untyped-throw. `allowHandleFactories` lists documented low-level handle
 * constructors. `severity` overrides a rule's default severity ("error",
 * "warn", or "off" to disable it entirely). Nine dependency-graph, style, and
 * error-taxonomy rules — config-via-tags, no-implicit-tag-read, no-naked-globals,
 * no-module-state, prefer-destructured-deps, no-untyped-throw,
 * no-swallowed-error, no-handle-spread, and no-immediate-return-binding — default to "warn" severity (see `defaultSeverity`) so
 * they surface in `--json` output and local runs without failing the root
 * `pnpm lint` exit code, which today only scans docs and practical examples
 * rather than the whole monorepo — a wide, unaudited sweep of those rules
 * across every package would produce noise no single PR could clean up in
 * one pass. Projects that want to enforce a rule as a hard failure can opt
 * in via `rules: { "<ruleId>": { severity: "error" } }`.
 */
export interface RuleConfig {
  severity?: Severity | "off"
  allowImplicit?: string[]
  allowGlobals?: string[]
  allowBuiltins?: string[]
  allowHandleFactories?: string[]
}

export type RuleOptions = Partial<Record<RuleId, RuleConfig>>

/**
 * `compositionPaths` extends the built-in composition-root path convention
 * (`main|bootstrap|wire|adapter|composition|http|transport|server` filenames)
 * with project-specific
 * regexes (RegExp source strings tested against the normalized absolute file path).
 * Matching files receive exactly the same treatment as built-in composition
 * paths: ambient IO and naked globals are allowed, scope arguments are
 * softened to the glue diagnostic, scope factories are allowed, and
 * unattributed awaits are allowed. Every other rule still applies. Use it for
 * composition/acceptance roots the
 * built-in filename convention misses (e.g. probe harnesses); it is a path
 * classification, not a per-line suppression.
 */
export interface ScanOptions {
  cwd?: string
  rules?: RuleOptions
  compositionPaths?: string[]
}

const defaultSeverity: Partial<Record<RuleId, Severity>> = {
  "pumped/config-via-tags": "warn",
  "pumped/no-handle-spread": "warn",
  "pumped/no-immediate-return-binding": "warn",
  "pumped/no-implicit-tag-read": "warn",
  "pumped/no-naked-globals": "warn",
  "pumped/no-module-state": "warn",
  "pumped/prefer-destructured-deps": "warn",
  "pumped/no-untyped-throw": "warn",
  "pumped/no-swallowed-error": "warn",
}

const builtinErrorNames = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
])

function severityOf(ruleId: RuleId): Severity {
  return defaultSeverity[ruleId] ?? "error"
}

function applyRuleOptions(diagnostics: Diagnostic[], options?: ScanOptions): Diagnostic[] {
  const rules = options?.rules
  if (!rules) return diagnostics
  const result: Diagnostic[] = []
  for (const diagnostic of diagnostics) {
    const override = rules[diagnostic.ruleId]?.severity
    if (override === "off") continue
    result.push(override ? { ...diagnostic, severity: override } : diagnostic)
  }
  return result
}

type Imports = {
  createScope: Set<string>
  controller: Map<string, number>
  creatorImportEnds: Map<string, number>
  creatorKinds: Map<string, CreatorKind>
  creators: Set<string>
  flow: Set<string>
  liteNamespaces: Set<string>
  liteNamespaceImportEnds: Map<string, number>
  liteReactNamespaces: Set<string>
  localImports: Set<string>
  mockFns: Set<string>
  nodeBuiltins: Map<string, string>
  pumpedNamespaces: Set<string>
  reactNamespaces: Set<string>
  render: Set<string>
  stepLocals: Set<string>
  tagExecutorLocals: Map<string, string>
  tagsNamespaceLocals: Set<string>
  testLibraryNamespaces: Set<string>
  useExecutionContext: Set<string>
  useScope: Set<string>
  useState: Set<string>
  viObjects: Set<string>
}

type CreatorKind = "atom" | "flow" | "material" | "resource" | "tag" | "scopedValue"

const creatorNames = new Set(["atom", "flow", "material", "resource", "tag", "scopedValue"])
const graphNodeCreatorKinds = new Set<CreatorKind>(["atom", "flow", "resource"])
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"])
const textExtensions = new Set([...sourceExtensions, ".json", ".md", ".mdx"])
const ignoredNames = new Set(["node_modules", ".git", "dist", "coverage", ".next", ".turbo"])
const ignoredFiles = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock"])
const suffixPattern = /(Atom|Flow|Resource|Tag|ScopedValue)$/
const testBranchPattern = /(?:process\.env\.NODE_ENV|import\.meta\.env\.MODE)\s*={2,3}\s*["']test["']/g
const jsdomPattern = /@vitest-environment\s+jsdom|setup\.dom|\.dom\.test/gi
const jsdomPackagePattern = /"(?:global-)?jsdom"\s*:/g
const internalExampleLabelPattern = new RegExp(`\\b${["gol", "den"].join("")}\\b`, "gi")
const compositionPathPattern = /(?:^|\/)(?:main|bootstrap|wire|adapter|composition|http|transport|server)\.[cm]?[jt]sx?$/
const beforePathPattern = /(?:^|\/)before\.[cm]?[jt]sx?$/
const testPathPattern = /(?:^|\/)(?:tests?|__tests__)\/|(?:\.|\/)(?:test|spec|browser|bench)\.[cm]?[jt]sx?$/
const ambientNamePattern = /(Http|Transport|Clock|Storage|Random|Timer|Poller|Route|Adapter|Boundary|Main|Root|Bootstrap|Wire|Env|Ids?)/i
const ambientCalls = new Set(["fetch", "setTimeout", "setInterval", "clearTimeout", "clearInterval"])
const ambientObjects = new Set(["window", "document", "localStorage", "sessionStorage", "crypto"])
const mockCalls = new Set(["mock", "doMock", "spyOn"])
const tagExecutorModes = new Set(["required", "optional", "all"])
const nodeBuiltinModulePattern = /^(?:node:)?(?:fs|fs\/promises|child_process)$/
const nakedGlobalDefaultAllow = new Set(["JSON", "Object", "Array", "String", "Number", "structuredClone", "URL", "Math"])
const containerCreators = new Set(["Map", "Set"])
const ctxArgumentMessage = "ctx is a receiver, never an argument; reify the contract as a flow reached via deps."
const exportedScopeGlueMessage = "exported scope/ctx-taking functions are shared glue; roots stay inline, reuse lives in the graph."
const scopeReachMessage = "graph nodes never reach the scope or create execution contexts; boundaries live at composition roots."
const unattributedAwaitMessage = "awaited foreign call outside a declared span; move it into a step-tagged flow or reach it through a port flow."
const graphMachineryMethods = new Set(["exec", "execStream", "prepare"])

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/")
}

function isTextFile(filePath: string): boolean {
  return textExtensions.has(extname(filePath))
}

function isSourceFile(filePath: string): boolean {
  return sourceExtensions.has(extname(filePath))
}

function isIgnoredPath(filePath: string): boolean {
  const normalized = normalizePath(filePath)
  if (ignoredFiles.has(basename(normalized))) return true
  if (beforePathPattern.test(normalized)) return true
  return normalized.split("/").some((part) => ignoredNames.has(part))
}

function isTestPath(filePath: string): boolean {
  return testPathPattern.test(normalizePath(filePath))
}

function isBrowserTestPath(filePath: string): boolean {
  return /\.browser\.test\.[cm]?[jt]sx?$/.test(normalizePath(filePath))
}

function compileCompositionPaths(options?: ScanOptions): RegExp[] {
  return (options?.compositionPaths ?? []).map((source) => new RegExp(source))
}

function isCompositionPath(filePath: string, extraCompositionPaths: RegExp[] = []): boolean {
  const normalized = normalizePath(filePath)
  return compositionPathPattern.test(normalized) || extraCompositionPaths.some((pattern) => pattern.test(normalized))
}

function isReactFeaturePath(filePath: string, extraCompositionPaths: RegExp[] = []): boolean {
  return extname(filePath).endsWith("x") && !isTestPath(filePath) && !isCompositionPath(filePath, extraCompositionPaths)
}

function isAmbientAllowedPath(filePath: string, extraCompositionPaths: RegExp[] = []): boolean {
  const normalized = normalizePath(filePath)
  return isTestPath(normalized) || isCompositionPath(normalized, extraCompositionPaths) || /(?:^|\/)(?:infra|transport|adapters?)\//.test(normalized)
}

function textLocation(source: string, index: number): Pick<Diagnostic, "line" | "column"> {
  let line = 1
  let column = 1
  for (let i = 0; i < index; i++) {
    if (source.charCodeAt(i) === 10) {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}

function nodeLocation(sourceFile: ts.SourceFile, node: ts.Node): Pick<Diagnostic, "line" | "column"> {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return { line: position.line + 1, column: position.character + 1 }
}

function pushTextDiagnostic(
  diagnostics: Diagnostic[],
  source: string,
  filePath: string,
  ruleId: RuleId,
  index: number,
  message: string,
): void {
  diagnostics.push({ ruleId, severity: severityOf(ruleId), filePath, ...textLocation(source, index), message })
}

function pushNodeDiagnostic(
  diagnostics: Diagnostic[],
  sourceFile: ts.SourceFile,
  filePath: string,
  ruleId: RuleId,
  node: ts.Node,
  message: string,
): void {
  diagnostics.push({ ruleId, severity: severityOf(ruleId), filePath, ...nodeLocation(sourceFile, node), message })
}

function addTextDiagnostics(source: string, filePath: string, diagnostics: Diagnostic[]): void {
  for (const match of source.matchAll(internalExampleLabelPattern)) {
    pushTextDiagnostic(
      diagnostics,
      source,
      filePath,
      "pumped/no-internal-example-label",
      match.index ?? 0,
      "Use practical/example wording instead of the old internal intention label.",
    )
  }

  for (const match of source.matchAll(jsdomPattern)) {
    pushTextDiagnostic(
      diagnostics,
      source,
      filePath,
      "pumped/no-jsdom-backend",
      match.index ?? 0,
      "Rendered observer tests should use Vitest Browser Mode, not JSDOM markers.",
    )
  }

  if (basename(filePath) === "package.json") {
    for (const match of source.matchAll(jsdomPackagePattern)) {
      pushTextDiagnostic(
        diagnostics,
        source,
        filePath,
        "pumped/no-jsdom-backend",
        match.index ?? 0,
        "Rendered observer tests should use Vitest Browser Mode, not JSDOM dependencies.",
      )
    }
  }

  for (const match of source.matchAll(testBranchPattern)) {
    pushTextDiagnostic(
      diagnostics,
      source,
      filePath,
      "pumped/no-test-only-branches",
      match.index ?? 0,
      "Test radius should use scope presets instead of product branches for test mode.",
    )
  }
}

function collectImports(sourceFile: ts.SourceFile): Imports {
  const imports: Imports = {
    createScope: new Set(),
    controller: new Map(),
    creatorImportEnds: new Map(),
    creatorKinds: new Map(),
    creators: new Set(),
    flow: new Set(),
    liteNamespaces: new Set(),
    liteNamespaceImportEnds: new Map(),
    liteReactNamespaces: new Set(),
    localImports: new Set(),
    mockFns: new Set(),
    nodeBuiltins: new Map(),
    pumpedNamespaces: new Set(),
    reactNamespaces: new Set(),
    render: new Set(),
    stepLocals: new Set(),
    tagExecutorLocals: new Map(),
    tagsNamespaceLocals: new Set(),
    testLibraryNamespaces: new Set(),
    useExecutionContext: new Set(),
    useScope: new Set(),
    useState: new Set(),
    viObjects: new Set(["jest", "vi"]),
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const moduleName = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (!clause) continue

    if (moduleName.startsWith("node:") || nodeBuiltinModulePattern.test(moduleName)) {
      if (clause.name) imports.nodeBuiltins.set(clause.name.text, moduleName)
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        imports.nodeBuiltins.set(clause.namedBindings.name.text, moduleName)
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const specifier of clause.namedBindings.elements) {
          imports.nodeBuiltins.set(specifier.name.text, moduleName)
        }
      }
      continue
    }

    if (!clause.namedBindings) continue

    if (ts.isNamespaceImport(clause.namedBindings)) {
      if (moduleName.startsWith("@pumped-fn/")) imports.pumpedNamespaces.add(clause.namedBindings.name.text)
      if (moduleName === "@pumped-fn/lite") {
        imports.liteNamespaces.add(clause.namedBindings.name.text)
        imports.liteNamespaceImportEnds.set(clause.namedBindings.name.text, clause.namedBindings.name.getEnd())
      }
      if (moduleName === "@pumped-fn/lite-react") imports.liteReactNamespaces.add(clause.namedBindings.name.text)
      if (moduleName === "react") imports.reactNamespaces.add(clause.namedBindings.name.text)
      if (moduleName === "@testing-library/react") imports.testLibraryNamespaces.add(clause.namedBindings.name.text)
      if (/tags/i.test(moduleName)) imports.tagsNamespaceLocals.add(clause.namedBindings.name.text)
      continue
    }

    for (const specifier of clause.namedBindings.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text
      const local = specifier.name.text
      if (moduleName.startsWith(".")) imports.localImports.add(local)
      if (moduleName === "@pumped-fn/lite" && imported === "createScope") {
        imports.createScope.add(local)
      }
      if (moduleName === "@pumped-fn/lite" && imported === "controller") {
        imports.controller.set(local, specifier.name.getEnd())
      }
      if (moduleName === "@pumped-fn/lite" && imported === "flow") {
        imports.flow.add(local)
      }
      if ((moduleName === "@pumped-fn/lite" || moduleName === "@pumped-fn/lite-react") && creatorNames.has(imported)) {
        imports.creators.add(local)
        imports.creatorImportEnds.set(local, specifier.name.getEnd())
        imports.creatorKinds.set(local, imported as CreatorKind)
      }
      if (moduleName === "@pumped-fn/sdk" && imported === "material") {
        imports.creators.add(local)
        imports.creatorImportEnds.set(local, specifier.name.getEnd())
        imports.creatorKinds.set(local, "material")
      }
      if (moduleName === "@testing-library/react" && imported === "render") {
        imports.render.add(local)
      }
      if (moduleName === "@pumped-fn/sdk" && imported === "step") {
        imports.stepLocals.add(local)
      }
      if (moduleName === "@pumped-fn/lite-react" && imported === "useScope") {
        imports.useScope.add(local)
      }
      if (moduleName === "@pumped-fn/lite-react" && imported === "useExecutionContext") {
        imports.useExecutionContext.add(local)
      }
      if (moduleName === "react" && imported === "useState") {
        imports.useState.add(local)
      }
      if (moduleName === "vitest" && imported === "vi") {
        imports.viObjects.add(local)
      }
      if (moduleName === "@jest/globals" && imported === "jest") {
        imports.viObjects.add(local)
      }
      if (imported === "tags") {
        imports.tagsNamespaceLocals.add(local)
      }
      if (tagExecutorModes.has(imported)) {
        imports.tagExecutorLocals.set(local, imported)
      }
    }
  }

  return imports
}

function calledName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return null
}

function creatorKind(expression: ts.Expression, imports: Imports): CreatorKind | null {
  if (ts.isIdentifier(expression)) return imports.creatorKinds.get(expression.text) ?? null
  if (!ts.isPropertyAccessExpression(expression) || !creatorNames.has(expression.name.text)) return null
  if (!ts.isIdentifier(expression.expression)) return null
  if (!imports.liteNamespaces.has(expression.expression.text) && !imports.liteReactNamespaces.has(expression.expression.text)) return null
  return expression.name.text as CreatorKind
}

function isNamespaceCall(expression: ts.Expression, namespaces: Set<string>, name: string): boolean {
  return ts.isPropertyAccessExpression(expression)
    && expression.name.text === name
    && ts.isIdentifier(expression.expression)
    && namespaces.has(expression.expression.text)
}

function isCreatorCall(expression: ts.Expression, imports: Imports): boolean {
  return creatorKind(expression, imports) !== null
}

function unshadowedCreatorKind(expression: ts.Expression, sourceFile: ts.SourceFile, imports: Imports): CreatorKind | null {
  if (ts.isIdentifier(expression)) {
    const kind = imports.creatorKinds.get(expression.text)
    const importEnd = imports.creatorImportEnds.get(expression.text)
    return kind && importEnd !== undefined && !shadowsName(expression, sourceFile, expression.text, importEnd) ? kind : null
  }
  if (
    !ts.isPropertyAccessExpression(expression)
    || !ts.isIdentifier(expression.expression)
    || !creatorNames.has(expression.name.text)
  ) return null
  const namespace = expression.expression
  const importEnd = imports.liteNamespaceImportEnds.get(namespace.text)
  if (importEnd === undefined || shadowsName(namespace, sourceFile, namespace.text, importEnd)) return null
  return expression.name.text as CreatorKind
}

function immediateReturnBindings(block: ts.Block): ts.VariableDeclaration[] {
  const matches: ts.VariableDeclaration[] = []
  for (let index = 0; index < block.statements.length - 1; index++) {
    const statement = block.statements[index]
    const next = block.statements[index + 1]
    if (
      !statement
      || !next
      || !ts.isVariableStatement(statement)
      || statement.declarationList.declarations.length !== 1
      || !ts.isReturnStatement(next)
      || !next.expression
      || !ts.isIdentifier(next.expression)
    ) continue
    const declaration = statement.declarationList.declarations[0]
    if (!declaration || !declaration.initializer || !ts.isIdentifier(declaration.name) || declaration.name.text !== next.expression.text) continue
    const bindingName = declaration.name.text
    let sameNameCount = 0
    function count(node: ts.Node): void {
      if (ts.isIdentifier(node) && node.text === bindingName) sameNameCount++
      ts.forEachChild(node, count)
    }
    count(block)
    if (sameNameCount === 2) matches.push(declaration)
  }
  return matches
}

function isFlowCall(expression: ts.Expression, imports: Imports): boolean {
  if (ts.isIdentifier(expression)) return imports.flow.has(expression.text)
  return isNamespaceCall(expression, imports.liteNamespaces, "flow")
}

function isCreateScopeCall(expression: ts.Expression, imports: Imports): boolean {
  if (ts.isIdentifier(expression)) return imports.createScope.has(expression.text)
  return isNamespaceCall(expression, imports.liteNamespaces, "createScope")
}

function visibleBinding(
  expression: ts.Identifier,
  sourceFile: ts.SourceFile,
  candidates: ts.VariableDeclaration[],
): ts.VariableDeclaration | undefined {
  const name = expression.text
  const position = expression.getStart(sourceFile)
  return candidates
    .filter((candidate) => {
      let scope: ts.Node | undefined = candidate.parent
      while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope) && !ts.isModuleBlock(scope)) {
        scope = scope.parent
      }
      return scope !== undefined
        && candidate.getEnd() <= position
        && scope.getStart(sourceFile) <= position
        && position < scope.getEnd()
        && !shadowsName(expression, sourceFile, name, candidate.getEnd())
    })
    .sort((a, b) => b.getStart(sourceFile) - a.getStart(sourceFile))[0]
}

function createScopeBinding(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  imports: Imports,
): ts.VariableDeclaration | undefined {
  if (!ts.isIdentifier(expression)) return undefined
  const name = expression.text
  const candidates: ts.VariableDeclaration[] = []
  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === name
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && isCreateScopeCall(node.initializer.expression, imports)
    ) candidates.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return visibleBinding(expression, sourceFile, candidates)
}

function isCreateScopeValue(expression: ts.Expression, sourceFile: ts.SourceFile, imports: Imports): boolean {
  if (ts.isCallExpression(expression)) return isCreateScopeCall(expression.expression, imports)
  return createScopeBinding(expression, sourceFile, imports) !== undefined
}

function createContextBinding(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  imports: Imports,
): ts.VariableDeclaration | undefined {
  if (!ts.isIdentifier(expression)) return undefined
  const name = expression.text
  const candidates: ts.VariableDeclaration[] = []
  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === name
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && ts.isPropertyAccessExpression(node.initializer.expression)
      && node.initializer.expression.name.text === "createContext"
      && isCreateScopeValue(node.initializer.expression.expression, sourceFile, imports)
    ) candidates.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return visibleBinding(expression, sourceFile, candidates)
}

function isCreateContextValue(expression: ts.Expression, sourceFile: ts.SourceFile, imports: Imports): boolean {
  if (
    ts.isCallExpression(expression)
    && ts.isPropertyAccessExpression(expression.expression)
    && expression.expression.name.text === "createContext"
  ) return isCreateScopeValue(expression.expression.expression, sourceFile, imports)
  return createContextBinding(expression, sourceFile, imports) !== undefined
}

function containsRuntimeValue(node: ts.Node, matches: (expression: ts.Expression) => boolean): boolean {
  if (ts.isExpression(node) && matches(node)) return true
  let found = false
  function visit(child: ts.Node): void {
    if (found || ts.isTypeNode(child)) return
    if (ts.isPropertyAccessExpression(child)) {
      found = containsRuntimeValue(child.expression, matches)
      return
    }
    if (ts.isPropertyAssignment(child)) {
      if (ts.isComputedPropertyName(child.name)) visit(child.name.expression)
      if (!found) visit(child.initializer)
      return
    }
    if (ts.isShorthandPropertyAssignment(child)) {
      found = containsRuntimeValue(child.name, matches)
      return
    }
    if (ts.isVariableDeclaration(child) || ts.isParameter(child) || ts.isBindingElement(child)) {
      if (child.initializer) visit(child.initializer)
      return
    }
    if (ts.isExpression(child) && matches(child)) {
      found = true
      return
    }
    ts.forEachChild(child, visit)
  }
  ts.forEachChild(node, visit)
  return found
}

function containsCreateScopeValue(node: ts.Node, sourceFile: ts.SourceFile, imports: Imports): boolean {
  return containsRuntimeValue(node, (expression) => isCreateScopeValue(expression, sourceFile, imports))
}

function containsCreateContextValue(node: ts.Node, sourceFile: ts.SourceFile, imports: Imports): boolean {
  return containsRuntimeValue(node, (expression) => isCreateContextValue(expression, sourceFile, imports))
}

function containsUnshadowedReference(root: ts.Node, name: string, boundary: ts.Node, afterPosition: number): boolean {
  let found = false
  function visit(node: ts.Node): void {
    if (found || ts.isTypeNode(node)) return
    if (ts.isPropertyAccessExpression(node)) {
      visit(node.expression)
      return
    }
    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) visit(node.name.expression)
      visit(node.initializer)
      return
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      if (node.name.text === name && !shadowsName(node.name, boundary, name, afterPosition)) found = true
      return
    }
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
      if (node.initializer) visit(node.initializer)
      return
    }
    if (ts.isIdentifier(node)) {
      if (node.text === name && !shadowsName(node, boundary, name, afterPosition)) found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return found
}

function returnsCreateScope(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression, imports: Imports): boolean {
  if (!node.body) return false
  if (ts.isCallExpression(node.body)) return isCreateScopeCall(node.body.expression, imports)
  if (!ts.isBlock(node.body)) return false
  return node.body.statements.some((statement) =>
    ts.isReturnStatement(statement)
    && statement.expression !== undefined
    && ts.isCallExpression(statement.expression)
    && isCreateScopeCall(statement.expression.expression, imports)
  )
}

function returnedExpressions(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression): ts.Expression[] {
  if (!node.body) return []
  if (!ts.isBlock(node.body)) return [node.body]
  const expressions: ts.Expression[] = []
  function walk(current: ts.Node): void {
    if (current !== node.body && (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current))) return
    if (ts.isReturnStatement(current) && current.expression) expressions.push(current.expression)
    ts.forEachChild(current, walk)
  }
  walk(node.body)
  return expressions
}

function localCreatorNames(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression, imports: Imports): Set<string> {
  const names = new Set<string>()
  if (!node.body) return names
  function walk(current: ts.Node): void {
    if (current !== node.body && (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current))) return
    if (
      ts.isVariableDeclaration(current)
      && ts.isIdentifier(current.name)
      && current.initializer
      && ts.isCallExpression(current.initializer)
      && isCreatorCall(current.initializer.expression, imports)
    ) {
      names.add(current.name.text)
    }
    ts.forEachChild(current, walk)
  }
  walk(node.body)
  return names
}

function expressionReturnsHandle(expression: ts.Expression, imports: Imports, locals: Set<string>): boolean {
  if (ts.isIdentifier(expression) && locals.has(expression.text)) return true
  let found = false
  function walk(current: ts.Node): void {
    if (found) return
    if (ts.isCallExpression(current) && isCreatorCall(current.expression, imports)) {
      found = true
      return
    }
    if (ts.isIdentifier(current) && locals.has(current.text)) {
      found = true
      return
    }
    ts.forEachChild(current, walk)
  }
  walk(expression)
  return found
}

function returnsHandle(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression, imports: Imports): boolean {
  const locals = localCreatorNames(node, imports)
  return returnedExpressions(node).some((expression) => expressionReturnsHandle(expression, imports, locals))
}

function enclosingParameterClosures(
  node: ts.CallExpression,
  imports: Imports,
): Array<{ name: ts.Identifier; owner: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression }> {
  const config = unitCallObject(node, imports)
  const factory = config && objectProperty(config, "factory")
  if (!factory || (!ts.isArrowFunction(factory.initializer) && !ts.isFunctionExpression(factory.initializer))) return []
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const references = collectIdentifierReferences(factory.initializer.body)
      const owner = current
      return current.parameters.flatMap((parameter) =>
        ts.isIdentifier(parameter.name) && references.has(parameter.name.text)
          ? [{ name: parameter.name, owner }]
          : []
      )
    }
    current = current.parent
  }
  return []
}

function exported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
}

function variableStatement(node: ts.Node): ts.VariableStatement | null {
  let current: ts.Node | undefined = node
  while (current) {
    if (ts.isVariableStatement(current)) return current
    current = current.parent
  }
  return null
}

function hasScopeParameter(parameters: ts.NodeArray<ts.ParameterDeclaration>): boolean {
  return parameters.some((parameter) => {
    if (ts.isIdentifier(parameter.name) && parameter.name.text === "scope") return true
    if (!parameter.type) return false
    return /\b(?:Lite\.)?Scope\b/.test(parameter.type.getText())
  })
}

function hasScopeOrExecutionContextParameter(parameters: ts.NodeArray<ts.ParameterDeclaration>): boolean {
  return parameters.some((parameter) => {
    if (ts.isIdentifier(parameter.name) && parameter.name.text === "scope") return true
    if (!parameter.type) return false
    return /\b(?:Lite\.)?(?:Scope|ExecutionContext)\b/.test(parameter.type.getText())
  })
}

function declarationName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node
  while (current) {
    if ((ts.isVariableDeclaration(current) || ts.isFunctionDeclaration(current)) && current.name && ts.isIdentifier(current.name)) {
      return current.name.text
    }
    if (ts.isMethodDeclaration(current) && current.name && ts.isIdentifier(current.name)) return current.name.text
    current = current.parent
  }
  return null
}

function nearestCreatorConfig(node: ts.Node, imports: Imports) {
  const sourceFile = node.getSourceFile()
  let current: ts.Node | undefined = node
  while (current) {
    if (ts.isObjectLiteralExpression(current)) {
      const call: ts.Node = current.parent
      if (ts.isCallExpression(call) && call.arguments[0] === current) {
        const kind = unshadowedCreatorKind(call.expression, sourceFile, imports)
        if (kind !== null) return { config: current, kind }
      }
    }
    current = current.parent
  }
  return null
}

function insideOwnedBoundary(node: ts.Node, imports: Imports): boolean {
  const nearest = nearestCreatorConfig(node, imports)
  if (nearest === null) return false
  const ownership = objectProperty(nearest.config, "ownership")
  const factory = objectProperty(nearest.config, "factory")
  let ancestor: ts.Node | undefined = node
  while (ancestor && ancestor !== nearest.config && ancestor !== factory?.initializer) ancestor = ancestor.parent
  return nearest.kind === "resource"
    && ownership !== null
    && ts.isStringLiteral(ownership.initializer)
    && ownership.initializer.text === "boundary"
    && ancestor === factory?.initializer
}

function ambientAllowedAt(node: ts.Node, filePath: string, imports: Imports, extraCompositionPaths: RegExp[] = []): boolean {
  if (isAmbientAllowedPath(filePath, extraCompositionPaths)) return true
  if (insideOwnedBoundary(node, imports)) return true
  let current: ts.Node | undefined = node
  while (current) {
    const name = declarationName(current)
    if (name !== null && ambientNamePattern.test(name)) return true
    current = current.parent
  }
  return false
}

function isAmbientCall(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) return ambientCalls.has(expression.text)
  if (!ts.isPropertyAccessExpression(expression)) return false
  if (ts.isIdentifier(expression.expression)) {
    const owner = expression.expression.text
    if (ambientObjects.has(owner)) return true
    if (owner === "Date" && expression.name.text === "now") return true
    if (owner === "Math" && expression.name.text === "random") return true
  }
  return false
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return null
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | null {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    if (propertyNameText(property.name) === name) return property
  }
  return null
}

function containsFlowProperty(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.some((property) =>
    ts.isPropertyAssignment(property) && propertyNameText(property.name) === "flow"
  )
}

function flowCallObject(node: ts.CallExpression, imports: Imports): ts.ObjectLiteralExpression | null {
  if (!isFlowCall(node.expression, imports)) return null
  const config = node.arguments[0]
  return config && ts.isObjectLiteralExpression(config) ? config : null
}

function enclosingFlowFactory(node: ts.Node, imports: Imports): ts.PropertyAssignment | null {
  let current: ts.Node | undefined = node
  while (current) {
    if (
      ts.isPropertyAssignment(current)
      && propertyNameText(current.name) === "factory"
      && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
    ) {
      const config = current.parent
      const call = config.parent
      if (
        ts.isObjectLiteralExpression(config)
        && ts.isCallExpression(call)
        && flowCallObject(call, imports) === config
      ) {
        return current
      }
    }
    current = current.parent
  }
  return null
}

function insideFactory(node: ts.Node, imports: Imports): boolean {
  return enclosingUnitFactory(node, imports) !== null || enclosingFlowFactory(node, imports) !== null
}

function containsThrow(root: ts.Node): boolean {
  let found = false
  function walk(node: ts.Node): void {
    if (found) return
    if (ts.isThrowStatement(node)) {
      found = true
      return
    }
    ts.forEachChild(node, walk)
  }
  walk(root)
  return found
}

function unitCallObject(node: ts.CallExpression, imports: Imports): ts.ObjectLiteralExpression | null {
  if (!isCreatorCall(node.expression, imports)) return null
  const config = node.arguments[0]
  return config && ts.isObjectLiteralExpression(config) ? config : null
}

function graphNodeCallObject(node: ts.CallExpression, imports: Imports): ts.ObjectLiteralExpression | null {
  const kind = creatorKind(node.expression, imports)
  if (kind === null || !graphNodeCreatorKinds.has(kind)) return null
  const config = node.arguments[0]
  return config && ts.isObjectLiteralExpression(config) ? config : null
}

function enclosingUnitFactory(node: ts.Node, imports: Imports): ts.ArrowFunction | ts.FunctionExpression | null {
  let current: ts.Node | undefined = node
  while (current) {
    if (
      ts.isPropertyAssignment(current)
      && propertyNameText(current.name) === "factory"
      && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
    ) {
      const config = current.parent
      const call = config.parent
      if (ts.isObjectLiteralExpression(config) && ts.isCallExpression(call) && unitCallObject(call, imports) === config) {
        return current.initializer
      }
    }
    current = current.parent
  }
  return null
}

function enclosingGraphNodeFactory(node: ts.Node, imports: Imports): ts.ArrowFunction | ts.FunctionExpression | null {
  let current: ts.Node | undefined = node
  while (current) {
    if (
      ts.isPropertyAssignment(current)
      && propertyNameText(current.name) === "factory"
      && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
    ) {
      const config = current.parent
      const call = config.parent
      if (ts.isObjectLiteralExpression(config) && ts.isCallExpression(call) && graphNodeCallObject(call, imports) === config) {
        return current.initializer
      }
    }
    current = current.parent
  }
  return null
}

function enclosingUnitConfig(node: ts.Node, imports: Imports): ts.ObjectLiteralExpression | null {
  const factory = enclosingUnitFactory(node, imports)
  return factory ? (factory.parent as ts.PropertyAssignment).parent as ts.ObjectLiteralExpression : null
}

function tagExecutorModeOf(expression: ts.Expression, imports: Imports): string | null {
  if (ts.isIdentifier(expression) && imports.tagExecutorLocals.has(expression.text)) {
    return imports.tagExecutorLocals.get(expression.text)!
  }
  if (
    ts.isPropertyAccessExpression(expression)
    && tagExecutorModes.has(expression.name.text)
    && ts.isIdentifier(expression.expression)
    && imports.tagsNamespaceLocals.has(expression.expression.text)
  ) {
    return expression.name.text
  }
  return null
}

function resolveObjectLiteral(expression: ts.Expression, sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | null {
  if (ts.isObjectLiteralExpression(expression)) return expression
  if (!ts.isIdentifier(expression)) return null
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === expression.text && declaration.initializer) {
        return resolveObjectLiteral(declaration.initializer, sourceFile)
      }
    }
  }
  return null
}

interface DepsAnalysis {
  names: Set<string>
  resolvable: boolean
}

function analyzeDeps(expression: ts.Expression, sourceFile: ts.SourceFile, imports: Imports): DepsAnalysis {
  const object = resolveObjectLiteral(expression, sourceFile)
  if (!object) return { names: new Set(), resolvable: false }

  const names = new Set<string>()
  let resolvable = true
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = analyzeDeps(property.expression, sourceFile, imports)
      for (const name of spread.names) names.add(name)
      if (!spread.resolvable) resolvable = false
      continue
    }
    if (!ts.isPropertyAssignment(property)) continue
    const initializer = property.initializer
    if (
      ts.isCallExpression(initializer)
      && tagExecutorModeOf(initializer.expression, imports)
      && initializer.arguments[0]
      && ts.isIdentifier(initializer.arguments[0])
    ) {
      names.add(initializer.arguments[0].text)
    }
  }
  return { names, resolvable }
}

function declaredTagNames(config: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile, imports: Imports): DepsAnalysis {
  const deps = objectProperty(config, "deps")
  if (!deps) return { names: new Set(), resolvable: true }
  return analyzeDeps(deps.initializer, sourceFile, imports)
}

function collectCreatorHandleNames(sourceFile: ts.SourceFile, imports: Imports): Set<string> {
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name)
        && declaration.initializer
        && ts.isCallExpression(declaration.initializer)
        && isCreatorCall(declaration.initializer.expression, imports)
      ) {
        names.add(declaration.name.text)
      }
    }
  }
  return names
}

function collectUnitFactoryNodes(sourceFile: ts.SourceFile, imports: Imports): Array<ts.ArrowFunction | ts.FunctionExpression> {
  const nodes: Array<ts.ArrowFunction | ts.FunctionExpression> = []
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const config = unitCallObject(node, imports)
      const factory = config && objectProperty(config, "factory")
      if (factory && (ts.isArrowFunction(factory.initializer) || ts.isFunctionExpression(factory.initializer))) {
        nodes.push(factory.initializer)
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(sourceFile)
  return nodes
}

function collectIdentifierReferences(root: ts.Node): Set<string> {
  const names = new Set<string>()
  function walk(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node)) {
      walk(node.expression)
      return
    }
    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) walk(node.name.expression)
      walk(node.initializer)
      return
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      names.add(node.name.text)
      return
    }
    if (ts.isIdentifier(node)) {
      names.add(node.text)
      return
    }
    ts.forEachChild(node, walk)
  }
  walk(root)
  return names
}

function collectBindingNames(name: ts.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(name)) {
    names.add(name.text)
    return
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBindingNames(element.name, names)
  }
}

function bindingHasName(binding: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(binding)) return binding.text === name
  return binding.elements.some((element) => ts.isBindingElement(element) && bindingHasName(element.name, name))
}

function declarationListHasName(list: ts.VariableDeclarationList, name: string): boolean {
  return list.declarations.some((declaration) => bindingHasName(declaration.name, name))
}

function statementDeclaresValue(statement: ts.Statement, name: string): boolean {
  if (ts.isVariableStatement(statement)) return declarationListHasName(statement.declarationList, name)
  if (
    ts.isFunctionDeclaration(statement)
    || ts.isClassDeclaration(statement)
    || ts.isEnumDeclaration(statement)
  ) return statement.name?.text === name
  if (ts.isImportEqualsDeclaration(statement)) return !statement.isTypeOnly && statement.name.text === name
  if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) return false
  const clause = statement.importClause
  if (!clause) return false
  if (clause.name?.text === name) return true
  const bindings = clause.namedBindings
  if (!bindings) return false
  if (ts.isNamespaceImport(bindings)) return bindings.name.text === name
  return bindings.elements.some((element) => !element.isTypeOnly && element.name.text === name)
}

function scopeStatementsDeclareValue(statements: ts.NodeArray<ts.Statement>, name: string): boolean {
  return statements.some((statement) => statementDeclaresValue(statement, name))
}

function isRuntimeFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isArrowFunction(node)
    || ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node)
}

function functionVarDeclaresValue(node: ts.FunctionLikeDeclaration, name: string): boolean {
  let found = false
  function visit(child: ts.Node): void {
    if (found || child !== node && (isRuntimeFunction(child) || ts.isClassLike(child))) return
    if (
      ts.isVariableDeclarationList(child)
      && !(child.flags & ts.NodeFlags.BlockScoped)
      && declarationListHasName(child, name)
    ) {
      found = true
      return
    }
    ts.forEachChild(child, visit)
  }
  if (node.body) visit(node.body)
  return found
}

function hasVisibleValueBinding(node: ts.Node, name: string): boolean {
  let current = node.parent
  while (current) {
    if (isRuntimeFunction(current)) {
      if (current.parameters.some((parameter) => bindingHasName(parameter.name, name))) return true
      if (
        (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current))
        && current.name?.text === name
      ) return true
      if (functionVarDeclaresValue(current, name)) return true
    } else if (ts.isBlock(current) || ts.isSourceFile(current)) {
      if (scopeStatementsDeclareValue(current.statements, name)) return true
    } else if (ts.isCaseBlock(current)) {
      if (current.clauses.some((clause) => scopeStatementsDeclareValue(clause.statements, name))) return true
    } else if (ts.isCatchClause(current) && current.variableDeclaration) {
      if (bindingHasName(current.variableDeclaration.name, name)) return true
    } else if (
      (ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current))
      && current.initializer
      && ts.isVariableDeclarationList(current.initializer)
      && declarationListHasName(current.initializer, name)
    ) {
      return true
    } else if (ts.isClassExpression(current) && current.name?.text === name) return true
    current = current.parent
  }
  return false
}

type InlineCallback = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration

function unwrapCallback(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)
  ) current = current.expression
  return current
}

function resolveLocalCallback(expression: ts.Expression, sourceFile: ts.SourceFile): InlineCallback | null {
  const direct = unwrapCallback(expression)
  if (ts.isArrowFunction(direct) || ts.isFunctionExpression(direct)) return direct
  if (!ts.isIdentifier(direct)) return null
  const name = direct.text
  const variables: ts.VariableDeclaration[] = []
  const declarations: ts.FunctionDeclaration[] = []
  function collect(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) variables.push(node)
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) declarations.push(node)
    ts.forEachChild(node, collect)
  }
  collect(sourceFile)
  const variable = visibleBinding(direct, sourceFile, variables)
  if (variable?.initializer) {
    const initializer = unwrapCallback(variable.initializer)
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer
  }
  const position = direct.getStart(sourceFile)
  return declarations
    .filter((declaration) => {
      let scope: ts.Node | undefined = declaration.parent
      while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope) && !ts.isModuleBlock(scope)) scope = scope.parent
      return scope
        && scope.getStart(sourceFile) <= position
        && position < scope.getEnd()
    })
    .sort((left, right) => right.getStart(sourceFile) - left.getStart(sourceFile))[0] ?? null
}

function callbackCaptures(callback: InlineCallback): string[] {
  if (!callback.body) return []
  const declared = new Set<string>()
  for (const parameter of callback.parameters) collectBindingNames(parameter.name, declared)
  if (callback.name) declared.add(callback.name.text)

  function collectDeclarations(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
      collectBindingNames(node.name, declared)
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isFunctionExpression(node))
      && node.name
    ) {
      declared.add(node.name.text)
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      collectBindingNames(node.variableDeclaration.name, declared)
    }
    ts.forEachChild(node, collectDeclarations)
  }
  collectDeclarations(callback.body)

  const references = new Set<string>()
  function collectReferences(node: ts.Node): void {
    if (ts.isTypeNode(node)) return
    if (ts.isPropertyAccessExpression(node)) {
      collectReferences(node.expression)
      return
    }
    if (ts.isElementAccessExpression(node)) {
      collectReferences(node.expression)
      collectReferences(node.argumentExpression)
      return
    }
    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) collectReferences(node.name.expression)
      collectReferences(node.initializer)
      return
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      references.add(node.name.text)
      return
    }
    if (
      ts.isVariableDeclaration(node)
      || ts.isParameter(node)
      || ts.isBindingElement(node)
      || ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isClassDeclaration(node)
    ) {
      if ("initializer" in node && node.initializer) collectReferences(node.initializer)
      if ("body" in node && node.body) collectReferences(node.body)
      return
    }
    if (ts.isIdentifier(node)) references.add(node.text)
    else ts.forEachChild(node, collectReferences)
  }
  collectReferences(callback.body)
  return [...references]
    .filter((name) => !declared.has(name) && (name !== "Promise" || hasVisibleValueBinding(callback, name)))
    .sort()
}

function isClosedOverByFactory(name: string, factoryNodes: Array<ts.ArrowFunction | ts.FunctionExpression>): boolean {
  return factoryNodes.some((factory) => collectIdentifierReferences(factory).has(name))
}

function nakedGlobalName(node: ts.CallExpression | ts.NewExpression): string | null {
  if (ts.isNewExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "Date" && (node.arguments ?? []).length === 0) return "Date"
    return null
  }

  const expression = node.expression
  if (ts.isIdentifier(expression)) {
    if (expression.text === "fetch") return "fetch"
    if (expression.text === "setTimeout" || expression.text === "setInterval") return expression.text
    return null
  }

  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    if (expression.expression.text === "Date" && expression.name.text === "now" && node.arguments.length === 0) return "Date.now"
    if (expression.expression.text === "Math" && expression.name.text === "random") return "Math.random"
  }

  return null
}

function containsMemberRead(body: ts.Node, paramName: string): boolean {
  let found = false
  function walk(node: ts.Node): void {
    if (found) return
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === paramName) {
      found = true
      return
    }
    ts.forEachChild(node, walk)
  }
  walk(body)
  return found
}

function factoryCtxName(factory: ts.ArrowFunction | ts.FunctionExpression | null): string | null {
  const parameter = factory?.parameters[0]
  return parameter && ts.isIdentifier(parameter.name) ? parameter.name.text : null
}

function rootIdentifier(expression: ts.Expression): ts.Identifier | null {
  if (ts.isIdentifier(expression)) return expression
  if (ts.isPropertyAccessExpression(expression)) return rootIdentifier(expression.expression)
  return null
}

function depsBindingNames(factory: ts.ArrowFunction | ts.FunctionExpression): Map<string, string | null> {
  const names = new Map<string, string | null>()
  const parameter = factory.parameters[1]
  if (!parameter) return names
  if (ts.isIdentifier(parameter.name)) {
    names.set(parameter.name.text, null)
    return names
  }
  if (ts.isObjectBindingPattern(parameter.name)) {
    for (const element of parameter.name.elements) {
      if (element.dotDotDotToken || !ts.isIdentifier(element.name)) continue
      const key = element.propertyName && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : element.name.text
      names.set(element.name.text, key)
    }
  }
  return names
}

function depKey(expression: ts.Expression, root: ts.Identifier, bound: string | null): string | null {
  if (bound !== null) return bound
  let current = expression
  let above: ts.PropertyAccessExpression | null = null
  while (ts.isPropertyAccessExpression(current)) {
    if (current.expression === root) {
      above = current
      break
    }
    current = current.expression
  }
  return above && above !== expression ? above.name.text : null
}

function depMethodDepth(expression: ts.Expression, root: ts.Identifier): number | null {
  let current = expression
  let depth = 0
  while (ts.isPropertyAccessExpression(current)) {
    depth++
    if (current.expression === root) return depth
    current = current.expression
  }
  return null
}

function isDirectDepMethod(expression: ts.PropertyAccessExpression, root: ts.Identifier, bound: string | null): boolean {
  const depth = depMethodDepth(expression, root)
  return bound !== null ? depth === 1 : depth === 2
}

function bindingNameHas(name: ts.BindingName, text: string): boolean {
  if (ts.isIdentifier(name)) return name.text === text
  return name.elements.some((element) => ts.isBindingElement(element) && !element.dotDotDotToken && bindingNameHas(element.name, text))
}

function statementDeclaresName(statement: ts.Statement, name: string): boolean {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some((declaration) => bindingNameHas(declaration.name, name))
  }
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
    return statement.name?.text === name
  }
  return false
}

function scopeStatements(node: ts.Node): readonly ts.Statement[] {
  if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)) return Array.from(node.statements)
  if (ts.isCaseClause(node) || ts.isDefaultClause(node)) return Array.from(node.statements)
  return []
}

function scopeDeclaresNameBefore(scope: ts.Node, position: number, name: string, afterPosition: number, sourceFile: ts.SourceFile): boolean {
  return scopeStatements(scope).some((statement) => {
    const start = statement.getStart(sourceFile)
    return start > afterPosition && start < position && statementDeclaresName(statement, name)
  })
}

function importedCallee(callee: ts.Identifier, imports: Map<string, number>): boolean {
  const importEnd = imports.get(callee.text)
  return importEnd !== undefined && !shadowsName(callee, callee.getSourceFile(), callee.text, importEnd)
}

function depInitializer(config: ts.ObjectLiteralExpression | null, key: string | null): ts.Expression | null {
  const deps = config && objectProperty(config, "deps")
  if (!key || !deps || !ts.isObjectLiteralExpression(deps.initializer)) return null
  for (const property of deps.initializer.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === key) return property.initializer
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === key) return property.name
  }
  return null
}

function depIsController(config: ts.ObjectLiteralExpression | null, key: string | null, imports: Imports): boolean {
  const initializer = depInitializer(config, key)
  return initializer !== null
    && ts.isCallExpression(initializer)
    && ts.isIdentifier(initializer.expression)
    && importedCallee(initializer.expression, imports.controller)
}

function hasStepTag(config: ts.ObjectLiteralExpression | null, imports: Imports): boolean {
  const tagsProperty = config && objectProperty(config, "tags")
  if (!tagsProperty || !ts.isArrayLiteralExpression(tagsProperty.initializer)) return false
  return tagsProperty.initializer.elements.some((element) =>
    ts.isCallExpression(element) && ts.isIdentifier(element.expression) && imports.stepLocals.has(element.expression.text)
  )
}

function shadowsName(node: ts.Node, boundary: ts.Node, name: string, afterPosition = -1): boolean {
  const sourceFile = node.getSourceFile()
  const position = node.getStart(sourceFile)
  let current: ts.Node | undefined = node.parent
  while (current && current !== boundary) {
    if (
      (ts.isFunctionDeclaration(current)
        || ts.isFunctionExpression(current)
        || ts.isArrowFunction(current)
        || ts.isMethodDeclaration(current)
        || ts.isConstructorDeclaration(current))
      && current.parameters.some((parameter) => bindingNameHas(parameter.name, name))
    ) {
      return true
    }
    if (
      ts.isCatchClause(current)
      && current.variableDeclaration !== undefined
      && bindingNameHas(current.variableDeclaration.name, name)
    ) {
      return true
    }
    if (
      (ts.isForStatement(current) || ts.isForOfStatement(current) || ts.isForInStatement(current))
      && current.initializer !== undefined
      && ts.isVariableDeclarationList(current.initializer)
      && current.initializer.declarations.some((declaration) => bindingNameHas(declaration.name, name))
    ) {
      return true
    }
    if (
      (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isClassDeclaration(current))
      && current.name?.text === name
    ) {
      return true
    }
    if (scopeDeclaresNameBefore(current, position, name, afterPosition, sourceFile)) return true
    current = current.parent
  }
  if (current === boundary && ts.isSourceFile(boundary)) {
    return scopeDeclaresNameBefore(boundary, position, name, afterPosition, sourceFile)
  }
  return false
}

function shouldScanAst(filePath: string): boolean {
  return isSourceFile(filePath)
}

function addAstDiagnostics(source: string, filePath: string, diagnostics: Diagnostic[], options?: ScanOptions): void {
  if (!shouldScanAst(filePath)) return

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    extname(filePath).endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const imports = collectImports(sourceFile)
  const extraCompositionPaths = compileCompositionPaths(options)
  const reactFeature = isReactFeaturePath(filePath, extraCompositionPaths)
  const allowScopeArgument = isTestPath(filePath) || isCompositionPath(filePath, extraCompositionPaths)
  const allowScopeFactory = isCompositionPath(filePath, extraCompositionPaths)
  const allowScopeReach = isTestPath(filePath)
  const allowUnattributedAwait = isTestPath(filePath) || isCompositionPath(filePath, extraCompositionPaths)
  const localFlows = new Set<string>()
  const allowImplicit = new Set(options?.rules?.["pumped/no-implicit-tag-read"]?.allowImplicit ?? [])
  const allowGlobals = new Set([...nakedGlobalDefaultAllow, ...(options?.rules?.["pumped/no-naked-globals"]?.allowGlobals ?? [])])
  const allowBuiltins = new Set(options?.rules?.["pumped/no-untyped-throw"]?.allowBuiltins ?? [])
  const allowHandleFactories = new Set([
    ...(options?.rules?.["pumped/no-handle-factory"]?.allowHandleFactories ?? []),
    ...(options?.rules?.["pumped/config-via-tags"]?.allowHandleFactories ?? []),
  ])
  const unitFactoryNodes = collectUnitFactoryNodes(sourceFile, imports)
  const hasGraphNodes = unitFactoryNodes.length > 0
  const creatorHandleNames = collectCreatorHandleNames(sourceFile, imports)
  const moduleValues = new Map<string, ts.Expression>()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        moduleValues.set(declaration.name.text, declaration.initializer)
      }
    }
  }
  function graphExpression(expression: ts.Expression, seen = new Set<string>()): boolean {
    if (
      ts.isAsExpression(expression)
      || ts.isTypeAssertionExpression(expression)
      || ts.isParenthesizedExpression(expression)
      || ts.isNonNullExpression(expression)
      || ts.isSatisfiesExpression(expression)
    ) return graphExpression(expression.expression, seen)

    if (ts.isIdentifier(expression)) {
      if (seen.has(expression.text)) return false
      const initializer = moduleValues.get(expression.text)
      if (!initializer) return false
      const nextSeen = new Set(seen)
      nextSeen.add(expression.text)
      return graphExpression(initializer, nextSeen)
    }

    if (ts.isPropertyAccessExpression(expression)) {
      return graphExpression(expression.expression, seen)
    }

    if (ts.isObjectLiteralExpression(expression)) {
      return expression.properties.length > 0 && expression.properties.every((property) => {
        if (ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name)) {
          return graphExpression(property.initializer, new Set(seen))
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          return graphExpression(property.name, new Set(seen))
        }
        return false
      })
    }

    if (ts.isArrayLiteralExpression(expression)) {
      return expression.elements.length > 0 && expression.elements.every((element) =>
        !ts.isSpreadElement(element) && graphExpression(element, new Set(seen)),
      )
    }

    if (!ts.isCallExpression(expression)) return false
    if (unshadowedCreatorKind(expression.expression, sourceFile, imports)) return true
    if (expression.arguments.length === 0) return false
    const root = rootIdentifier(expression.expression)
    const pumpedBinding = root && imports.pumpedNamespaces.has(root.text)
    const localImportedBinding = root && imports.localImports.has(root.text)
    const localBinding = ts.isPropertyAccessExpression(expression.expression)
      ? graphExpression(expression.expression.expression, new Set(seen))
      : graphExpression(expression.expression, new Set(seen))
    return (pumpedBinding || localImportedBinding || localBinding)
      && expression.arguments.every((argument) => graphExpression(argument, new Set(seen)))
  }

  function factoryCtxAt(node: ts.Node): { factory: ts.ArrowFunction | ts.FunctionExpression; name: string } | null {
    const factory = enclosingUnitFactory(node, imports)
    const name = factoryCtxName(factory)
    return factory && name ? { factory, name } : null
  }

  function graphFactoryCtxAt(node: ts.Node): { factory: ts.ArrowFunction | ts.FunctionExpression; name: string } | null {
    const factory = enclosingGraphNodeFactory(node, imports)
    const name = factoryCtxName(factory)
    return factory && name ? { factory, name } : null
  }

  function pushCtxDiagnostic(node: ts.Node): void {
    pushNodeDiagnostic(
      diagnostics,
      sourceFile,
      filePath,
      "pumped/no-ctx-argument",
      node,
      ctxArgumentMessage,
    )
  }

  function pushScopeReachDiagnostic(node: ts.Node): void {
    pushNodeDiagnostic(
      diagnostics,
      sourceFile,
      filePath,
      "pumped/no-scope-reach",
      node,
      scopeReachMessage,
    )
  }

  function isDirectCtxExpression(expression: ts.Expression, ctxName: string): expression is ts.Identifier {
    return ts.isIdentifier(expression) && expression.text === ctxName
  }

  function factoryDepsAt(node: ts.Node): { factory: ts.ArrowFunction | ts.FunctionExpression; names: Map<string, string | null> } | null {
    const factory = enclosingUnitFactory(node, imports)
    if (!factory) return null
    const names = depsBindingNames(factory)
    return names.size > 0 ? { factory, names } : null
  }

  function checkUnattributedAwait(call: ts.CallExpression, reportNode: ts.Node): void {
    if (allowUnattributedAwait) return
    const depsBinding = factoryDepsAt(call)
    if (!depsBinding) return
    const root = rootIdentifier(call.expression)
    if (!root || !depsBinding.names.has(root.text)) return
    if (shadowsName(root, depsBinding.factory, root.text)) return
    if (ts.isPropertyAccessExpression(call.expression)) {
      const method = call.expression.name.text
      const key = depKey(call.expression, root, depsBinding.names.get(root.text) ?? null)
      if (method === "resolve") {
        if (depIsController(enclosingUnitConfig(call, imports), key, imports)) return
      } else if (graphMachineryMethods.has(method)) {
        const config = enclosingUnitConfig(call, imports)
        if (isDirectDepMethod(call.expression, root, depsBinding.names.get(root.text) ?? null)) return
        if (depIsController(config, key, imports)) return
      }
    }
    if (hasStepTag(enclosingUnitConfig(call, imports), imports)) return
    pushNodeDiagnostic(diagnostics, sourceFile, filePath, "pumped/no-unattributed-await", reportNode, unattributedAwaitMessage)
  }

  function visit(node: ts.Node): void {
    if (ts.isBlock(node)) {
      for (const declaration of immediateReturnBindings(node)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-immediate-return-binding",
          declaration.name,
          `Inline "${declaration.name.getText(sourceFile)}" instead of declaring it only to return it immediately.`,
        )
      }
    }

    if (!allowScopeReach) {
      const ctxBinding = graphFactoryCtxAt(node)
      if (
        ctxBinding
        && ts.isPropertyAccessExpression(node)
        && node.name.text === "scope"
        && ts.isIdentifier(node.expression)
        && node.expression.text === ctxBinding.name
        && !shadowsName(node.expression, ctxBinding.factory, ctxBinding.name)
      ) {
        pushScopeReachDiagnostic(node)
      }

      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "createContext"
        && enclosingGraphNodeFactory(node, imports)
      ) {
        pushScopeReachDiagnostic(node.expression)
      }
    }

    const ctxBinding = factoryCtxAt(node)
    if (ctxBinding) {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        for (const argument of node.arguments ?? []) {
          if (ts.isSpreadElement(argument)) {
            if (isDirectCtxExpression(argument.expression, ctxBinding.name) && !shadowsName(argument.expression, ctxBinding.factory, ctxBinding.name)) {
              pushCtxDiagnostic(argument.expression)
            }
            continue
          }
          if (isDirectCtxExpression(argument, ctxBinding.name) && !shadowsName(argument, ctxBinding.factory, ctxBinding.name)) {
            pushCtxDiagnostic(argument)
          }
        }
      }

      if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          if (ts.isSpreadAssignment(property)) {
            if (isDirectCtxExpression(property.expression, ctxBinding.name) && !shadowsName(property.expression, ctxBinding.factory, ctxBinding.name)) {
              pushCtxDiagnostic(property.expression)
            }
            continue
          }
          if (ts.isShorthandPropertyAssignment(property)) {
            if (property.name.text === ctxBinding.name && !shadowsName(property.name, ctxBinding.factory, ctxBinding.name)) {
              pushCtxDiagnostic(property.name)
            }
            continue
          }
          if (!ts.isPropertyAssignment(property)) continue
          if (
            ts.isComputedPropertyName(property.name)
            && isDirectCtxExpression(property.name.expression, ctxBinding.name)
            && !shadowsName(property.name.expression, ctxBinding.factory, ctxBinding.name)
          ) {
            pushCtxDiagnostic(property.name.expression)
          }
          if (isDirectCtxExpression(property.initializer, ctxBinding.name) && !shadowsName(property.initializer, ctxBinding.factory, ctxBinding.name)) {
            pushCtxDiagnostic(property.initializer)
          }
        }
      }

      if (ts.isArrayLiteralExpression(node)) {
        for (const element of node.elements) {
          if (ts.isSpreadElement(element)) {
            if (isDirectCtxExpression(element.expression, ctxBinding.name) && !shadowsName(element.expression, ctxBinding.factory, ctxBinding.name)) {
              pushCtxDiagnostic(element.expression)
            }
            continue
          }
          if (isDirectCtxExpression(element, ctxBinding.name) && !shadowsName(element, ctxBinding.factory, ctxBinding.name)) {
            pushCtxDiagnostic(element)
          }
        }
      }
    }

    if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression)) {
      checkUnattributedAwait(node.expression, node.expression)
    }

    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "then"
      && ts.isCallExpression(node.expression.expression)
    ) {
      checkUnattributedAwait(node.expression.expression, node.expression.expression)
    }

    if (ts.isCallExpression(node)) {
      const name = calledName(node.expression)
      const explicitAtomType = node.typeArguments?.[0]
      if (explicitAtomType && unshadowedCreatorKind(node.expression, sourceFile, imports) === "atom") {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-explicit-atom-type-argument",
          explicitAtomType,
          "Let atom infer its value type; type substitutes with satisfies and Lite.Utils.AtomValue instead.",
        )
      }
      if (isCreatorCall(node.expression, imports)) {
        for (const closure of enclosingParameterClosures(node, imports)) {
          const ownerName = closure.owner.name && ts.isIdentifier(closure.owner.name) ? closure.owner.name.text : null
          if (ownerName && allowHandleFactories.has(ownerName)) continue
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/config-via-tags",
            closure.name,
            `Configuration parameter "${closure.name.text}" is closed over by a graph factory; declare configuration as a tag dependency instead.`,
          )
        }
      }
      if (
        ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && imports.viObjects.has(node.expression.expression.text)
        && mockCalls.has(node.expression.name.text)
      ) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-module-mocks",
          node.expression,
          "Use scope presets at the test seam instead of module mocks or spies.",
        )
      }

      if (ts.isIdentifier(node.expression) && name && imports.mockFns.has(name)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-module-mocks",
          node.expression,
          "Use scope presets at the test seam instead of module mocks or spies.",
        )
      }

      if (
        isTestPath(filePath)
        && !isBrowserTestPath(filePath)
        && (
          (name && imports.render.has(name))
          || isNamespaceCall(node.expression, imports.testLibraryNamespaces, "render")
        )
      ) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-render-outside-browser-test",
          node.expression,
          "Rendered observer tests should live in *.browser.test.tsx files.",
        )
      }

      if (reactFeature && name && imports.useScope.has(name)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-react-use-scope",
          node.expression,
          "Feature components should use graph hooks and useFlow instead of useScope.",
        )
      }

      if (reactFeature && isNamespaceCall(node.expression, imports.liteReactNamespaces, "useScope")) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-react-use-scope",
          node.expression,
          "Feature components should use graph hooks and useFlow instead of useScope.",
        )
      }

      if (reactFeature && name && imports.useExecutionContext.has(name)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-react-use-execution-context",
          node.expression,
          "Feature components should use useFlow for UI-triggered flows instead of useExecutionContext.",
        )
      }

      if (reactFeature && isNamespaceCall(node.expression, imports.liteReactNamespaces, "useExecutionContext")) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-react-use-execution-context",
          node.expression,
          "Feature components should use useFlow for UI-triggered flows instead of useExecutionContext.",
        )
      }

      if (reactFeature && name && imports.useState.has(name)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-react-local-state",
          node.expression,
          "Feature components should not mirror graph-owned state with useState.",
        )
      }

      if (reactFeature && isNamespaceCall(node.expression, imports.reactNamespaces, "useState")) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-react-local-state",
          node.expression,
          "Feature components should not mirror graph-owned state with useState.",
        )
      }

      if (
        reactFeature
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "createContext"
        && node.expression.expression.getText(sourceFile) !== "React"
      ) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-react-manual-execution-context",
          node.expression,
          "ExecutionContextProvider should own UI execution contexts.",
        )
      }

      if (
        reactFeature
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "close"
        && ts.isIdentifier(node.expression.expression)
        && /^(ctx|context|executionContext)$/i.test(node.expression.expression.text)
      ) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-react-manual-execution-context",
          node.expression,
          "Feature components should not close execution contexts manually.",
        )
      }

      if (isAmbientCall(node.expression) && !ambientAllowedAt(node, filePath, imports, extraCompositionPaths)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-ambient-io-outside-boundary",
          node.expression,
          "Raw ambient IO belongs in transport atoms or composition-root adapters.",
        )
      }

      const execFactory = factoryCtxAt(node)
      const executionOptions = node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])
        ? node.arguments[0]
        : undefined
      const directCtxExec = Boolean(
        execFactory
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "exec"
        && isDirectCtxExpression(node.expression.expression, execFactory.name)
      )
      const inlineScopeRun = Boolean(
        ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "run"
        && isCreateScopeValue(node.expression.expression, sourceFile, imports)
        && executionOptions
        && objectProperty(executionOptions, "fn")
      )
      const inlineCtxExec = Boolean(directCtxExec && executionOptions && objectProperty(executionOptions, "fn"))
      if (
        executionOptions
        && (inlineCtxExec || inlineScopeRun)
      ) {
        const receiver = inlineScopeRun ? "scope.run" : "ctx.exec"
        const missing = ["name", "deps", "params"].filter((property) => !objectProperty(executionOptions, property))
        if (missing.length > 0) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/no-hidden-exec-dependencies",
            executionOptions,
            `${receiver} inline options require name, deps, and params; missing "${missing.join(", ")}".`,
          )
        }
        const fnExpression = objectProperty(executionOptions, "fn")?.initializer
        const fn = fnExpression ? resolveLocalCallback(fnExpression, sourceFile) : null
        if (fn) {
          const first = fn.parameters[0]
          if (
            first
            && ts.isIdentifier(first.name)
            && /^(?:_*ctx|_*context|_*executionContext|_*scope)$/i.test(first.name.text)
          ) pushCtxDiagnostic(first)
          const captures = callbackCaptures(fn)
          if (captures.length > 0) {
            pushNodeDiagnostic(
              diagnostics,
              sourceFile,
              filePath,
              "pumped/no-hidden-exec-dependencies",
              fn,
              inlineScopeRun
                ? `scope.run callback captures "${captures.join(", ")}"; declare graph values in deps and provide runtime values through params.`
                : `ctx.exec callback captures "${captures.join(", ")}"; declare graph values in deps and provide runtime values through params.`,
            )
          }
        } else if (fnExpression) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/no-hidden-exec-dependencies",
            fnExpression,
            `${receiver} callback "${fnExpression.getText(sourceFile)}" cannot be inspected; use a local function or inline callback.`,
          )
        }
      }

      if ((inlineCtxExec || inlineScopeRun) && executionOptions) {
        const params = objectProperty(executionOptions, "params")?.initializer
        const receiver = ts.isPropertyAccessExpression(node.expression)
          ? node.expression.expression
          : undefined
        const scopeBinding = inlineScopeRun && receiver
          ? createScopeBinding(receiver, sourceFile, imports)
          : undefined
        const passesReceiver = Boolean(params && scopeBinding && receiver && ts.isIdentifier(receiver)
          && containsUnshadowedReference(params, receiver.text, sourceFile, scopeBinding.getEnd()))
        if (params && (passesReceiver || containsCreateScopeValue(params, sourceFile, imports))) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/no-scope-argument",
            params,
            "Do not pass scope through inline execution params; declare the operation dependencies in deps.",
          )
        }
        if (params && containsCreateContextValue(params, sourceFile, imports)) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/no-ctx-argument",
            params,
            ctxArgumentMessage,
          )
        }
      }

      if (
        enclosingFlowFactory(node, imports)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "exec"
        && node.arguments[0]
        && ts.isObjectLiteralExpression(node.arguments[0])
        && containsFlowProperty(node.arguments[0])
      ) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-direct-flow-composition",
          node.expression,
          "Flows should compose child flows through deps: { child: controller(childFlow) } and child.exec(...).",
        )
      }

      const unitFactory = unitCallObject(node, imports)
      const factoryProperty = unitFactory && objectProperty(unitFactory, "factory")
      if (
        factoryProperty
        && (ts.isArrowFunction(factoryProperty.initializer) || ts.isFunctionExpression(factoryProperty.initializer))
      ) {
        const depsParam = factoryProperty.initializer.parameters[1]
        if (depsParam && ts.isIdentifier(depsParam.name) && factoryProperty.initializer.body && containsMemberRead(factoryProperty.initializer.body, depsParam.name.text)) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/prefer-destructured-deps",
            depsParam,
            `Destructure the deps parameter in the factory signature (e.g. "factory: (ctx, { ${depsParam.name.text} }) => ...") instead of reading "${depsParam.name.text}.<field>" from an identifier param.`,
          )
        }
      }

      const unitConfig = enclosingUnitConfig(node, imports)
      if (unitConfig) {
        if (
          ts.isPropertyAccessExpression(node.expression)
          && (node.expression.name.text === "seekTag" || node.expression.name.text === "getTag")
          && node.arguments[0]
          && ts.isIdentifier(node.arguments[0])
        ) {
          const tagName = node.arguments[0].text
          const declared = declaredTagNames(unitConfig, sourceFile, imports)
          if (declared.resolvable && !declared.names.has(tagName) && !allowImplicit.has(tagName)) {
            pushNodeDiagnostic(
              diagnostics,
              sourceFile,
              filePath,
              "pumped/no-implicit-tag-read",
              node.expression,
              `Tag "${tagName}" is read via ${node.expression.name.text} but not declared in this unit's deps; declare it with tags.required/tags.optional/tags.all or allowlist it.`,
            )
          }
        }

        if (
          ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === "resolve"
          && ts.isPropertyAccessExpression(node.expression.expression)
          && node.expression.expression.name.text === "scope"
        ) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/no-implicit-tag-read",
            node.expression,
            "Undeclared graph value access via scope.resolve(...) inside a factory; declare the dependency in deps instead.",
          )
        }

        const globalName = nakedGlobalName(node)
        if (globalName && !allowGlobals.has(globalName) && !ambientAllowedAt(node, filePath, imports, extraCompositionPaths)) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/no-naked-globals",
            node.expression,
            `Wrap "${globalName}" in an adapter atom/resource or a tag instead of reading it directly inside a factory.`,
          )
        }

        if (
          ts.isIdentifier(node.expression)
          && imports.nodeBuiltins.has(node.expression.text)
          && !allowGlobals.has(imports.nodeBuiltins.get(node.expression.text)!)
          && !ambientAllowedAt(node, filePath, imports, extraCompositionPaths)
        ) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/no-naked-globals",
            node.expression,
            `Wrap "${imports.nodeBuiltins.get(node.expression.text)}" access in an adapter atom/resource instead of calling it directly inside a factory.`,
          )
        }

        if (
          ts.isPropertyAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression)
          && imports.nodeBuiltins.has(node.expression.expression.text)
          && !allowGlobals.has(imports.nodeBuiltins.get(node.expression.expression.text)!)
          && !ambientAllowedAt(node, filePath, imports, extraCompositionPaths)
        ) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/no-naked-globals",
            node.expression,
            `Wrap "${imports.nodeBuiltins.get(node.expression.expression.text)}" access in an adapter atom/resource instead of calling it directly inside a factory.`,
          )
        }
      }
    }

    if (
      ts.isNewExpression(node)
      && enclosingUnitConfig(node, imports)
      && !ambientAllowedAt(node, filePath, imports, extraCompositionPaths)
    ) {
      const globalName = nakedGlobalName(node)
      if (globalName && !allowGlobals.has(globalName)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-naked-globals",
          node,
          `Wrap "${globalName}" in an adapter atom/resource or a tag instead of reading it directly inside a factory.`,
        )
      }
    }

    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "process"
      && node.name.text === "env"
      && nearestCreatorConfig(node, imports)
      && !allowGlobals.has("process.env")
      && !ambientAllowedAt(node, filePath, imports, extraCompositionPaths)
    ) {
      pushNodeDiagnostic(
        diagnostics,
        sourceFile,
        filePath,
        "pumped/no-naked-globals",
        node,
        'Wrap "process.env" in an adapter atom/resource or a tag instead of reading it directly inside a factory.',
      )
    }

    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (
        ts.isIdentifier(node.name)
        && ts.isCallExpression(node.initializer)
        && isFlowCall(node.initializer.expression, imports)
      ) {
        localFlows.add(node.name.text)
      }

      if (ts.isIdentifier(node.name)) {
        if (ts.isIdentifier(node.initializer) && imports.viObjects.has(node.initializer.text)) {
          imports.viObjects.add(node.name.text)
        }
        if (
          ts.isPropertyAccessExpression(node.initializer)
          && ts.isIdentifier(node.initializer.expression)
          && imports.viObjects.has(node.initializer.expression.text)
          && mockCalls.has(node.initializer.name.text)
        ) {
          imports.mockFns.add(node.name.text)
        }
      }
      if (
        ts.isObjectBindingPattern(node.name)
        && ts.isIdentifier(node.initializer)
        && imports.viObjects.has(node.initializer.text)
      ) {
        for (const element of node.name.elements) {
          const property = element.propertyName ?? element.name
          if (ts.isIdentifier(property) && mockCalls.has(property.text) && ts.isIdentifier(element.name)) {
            imports.mockFns.add(element.name.text)
          }
        }
      }
    }

    if (
      basename(filePath).startsWith("vitest.config")
      && ts.isPropertyAssignment(node)
      && ts.isIdentifier(node.name)
      && node.name.text === "environment"
      && ts.isStringLiteral(node.initializer)
      && node.initializer.text === "jsdom"
    ) {
      pushNodeDiagnostic(
        diagnostics,
        sourceFile,
        filePath,
        "pumped/no-jsdom-backend",
        node.initializer,
        "Rendered observer tests should use Vitest Browser Mode, not JSDOM config.",
      )
    }

    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && suffixPattern.test(node.name.text)
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && isCreatorCall(node.initializer.expression, imports)
    ) {
      pushNodeDiagnostic(
        diagnostics,
        sourceFile,
        filePath,
        "pumped/no-definition-handle-suffix",
        node.name,
        "Definition handles should rely on inference instead of Atom/Flow/Resource/Tag suffixes.",
      )
    }

    if (ts.isCallExpression(node)) {
      const config = flowCallObject(node, imports)
      if (config) {
        const deps = objectProperty(config, "deps")
        if (deps && ts.isObjectLiteralExpression(deps.initializer)) {
          for (const property of deps.initializer.properties) {
            const initializer = ts.isShorthandPropertyAssignment(property)
              ? property.name
              : ts.isPropertyAssignment(property)
                ? property.initializer
                : null
            if (!initializer) continue
            if (ts.isIdentifier(initializer) && localFlows.has(initializer.text)) {
              pushNodeDiagnostic(
                diagnostics,
                sourceFile,
                filePath,
                "pumped/no-direct-flow-composition",
                initializer,
                "Flow dependencies should be explicit controller(childFlow) deps, not raw flow handles.",
              )
            }
          }
        }
      }
    }

    if (ts.isObjectLiteralExpression(node)) {
      const hasTagsProperty = node.properties.some((property) =>
        ts.isPropertyAssignment(property) && propertyNameText(property.name) === "tags"
      )
      for (const property of node.properties) {
        if (!ts.isSpreadAssignment(property) || !ts.isIdentifier(property.expression)) continue
        const isCreatorHandle = creatorHandleNames.has(property.expression.text)
        if (!isCreatorHandle && !hasTagsProperty) continue
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-handle-spread",
          property,
          "Re-export the shared flow directly and attach tags via a sibling `export const meta = pumped.route(...)` (or command/schedule) instead of spreading the handle — spreads fork node identity and break preset targeting. Only wrap in a thin entry flow (controller + exec) when the entry genuinely adapts/transforms input before calling the shared flow.",
        )
      }
    }

    if (!allowScopeFactory) {
      if (ts.isFunctionDeclaration(node) && node.name && returnsCreateScope(node, imports)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-shared-scope-factory",
          node.name,
          "Every use site should call createScope with the presets, tags, and extensions it needs.",
        )
      }

      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
        && returnsCreateScope(node.initializer, imports)
      ) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-shared-scope-factory",
          node.name,
          "Every use site should call createScope with the presets, tags, and extensions it needs.",
        )
      }
    }

    if (ts.isFunctionDeclaration(node) && exported(node)) {
      if (node.name && !allowHandleFactories.has(node.name.text) && returnsHandle(node, imports)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-handle-factory",
          node.name,
          "Export stable module-level handles instead of a function that constructs and returns a handle.",
        )
      }
      if (allowScopeArgument && isCompositionPath(filePath, extraCompositionPaths) && hasScopeOrExecutionContextParameter(node.parameters)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-scope-argument",
          node.name ?? node,
          exportedScopeGlueMessage,
        )
      } else if (!allowScopeArgument && hasScopeParameter(node.parameters)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-scope-argument",
          node.name ?? node,
          "Product helpers should not accept scope; composition roots and tests own scope creation.",
        )
      }
    }

    if (
      ts.isVariableDeclaration(node)
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      && exported(variableStatement(node) ?? node)
    ) {
      if (
        ts.isIdentifier(node.name)
        && !allowHandleFactories.has(node.name.text)
        && returnsHandle(node.initializer, imports)
      ) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-handle-factory",
          node.name,
          "Export stable module-level handles instead of a function that constructs and returns a handle.",
        )
      }
      if (allowScopeArgument && isCompositionPath(filePath, extraCompositionPaths) && hasScopeOrExecutionContextParameter(node.initializer.parameters)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-scope-argument",
          node.name,
          exportedScopeGlueMessage,
        )
      } else if (!allowScopeArgument && hasScopeParameter(node.initializer.parameters)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-scope-argument",
          node.name,
          "Product helpers should not accept scope; composition roots and tests own scope creation.",
        )
      }
    }

    if (hasGraphNodes && ts.isVariableStatement(node) && node.parent === sourceFile) {
      const isLet = (node.declarationList.flags & ts.NodeFlags.Let) !== 0
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue

        if (isLet) {
          pushNodeDiagnostic(
            diagnostics,
            sourceFile,
            filePath,
            "pumped/no-module-state",
            declaration.name,
            `Module-level "let ${declaration.name.text}" is shared mutable state; own it inside a resource/atom or scope-owned context instead.`,
          )
          continue
        }

        const initializer = declaration.initializer
        if (!initializer) continue

        const frozen = ts.isCallExpression(initializer)
          && ts.isPropertyAccessExpression(initializer.expression)
          && ts.isIdentifier(initializer.expression.expression)
          && initializer.expression.expression.text === "Object"
          && initializer.expression.name.text === "freeze"
        if (frozen) continue

        const isContainerLiteral = ts.isObjectLiteralExpression(initializer)
          || ts.isArrayLiteralExpression(initializer)
          || (ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression) && containerCreators.has(initializer.expression.text))
        if (!isContainerLiteral) continue

        const isExported = exported(node)
        const closedOver = isClosedOverByFactory(declaration.name.text, unitFactoryNodes)
        if (!isExported && !closedOver) continue
        if (isExported && graphExpression(initializer)) continue

        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-module-state",
          declaration.name,
          isExported
            ? `Module-level mutable container "${declaration.name.text}" is exported unfrozen; wrap it in Object.freeze(...) or own it inside a resource/atom instead.`
            : `Module-level mutable container "${declaration.name.text}" is closed over by a factory; own it inside a resource/atom or scope-owned context instead.`,
        )
      }
    }

    if (
      ts.isThrowStatement(node)
      && node.expression
      && ts.isNewExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && builtinErrorNames.has(node.expression.expression.text)
      && !allowBuiltins.has(node.expression.expression.text)
      && insideFactory(node, imports)
    ) {
      pushNodeDiagnostic(
        diagnostics,
        sourceFile,
        filePath,
        "pumped/no-untyped-throw",
        node.expression,
        `Throw a domain error class carrying structured fields (kind/op/entity) instead of bare "${node.expression.expression.text}"; in a flow factory, prefer ctx.fail(fault) with a declared "faults: typed<...>()" so traces and edges discriminate planned vs unplanned failures.`,
      )
    }

    if (ts.isCatchClause(node) && insideFactory(node, imports)) {
      const bindingName = node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)
        ? node.variableDeclaration.name.text
        : null
      const rethrows = containsThrow(node.block)
      const referencesBinding = bindingName !== null && collectIdentifierReferences(node.block).has(bindingName)
      if (!rethrows && !referencesBinding) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-swallowed-error",
          node,
          "Catch clause neither rethrows nor references the caught error; swallowing it here blinds the trace seam at this graph node.",
        )
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

export function scanText(source: string, filePath: string, options?: ScanOptions): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  addTextDiagnostics(source, filePath, diagnostics)
  addAstDiagnostics(source, filePath, diagnostics, options)
  return applyRuleOptions(diagnostics, options)
}

async function collectFiles(targetPath: string, files: string[]): Promise<void> {
  const info = await stat(targetPath)
  if (info.isDirectory()) {
    for (const entry of await readdir(targetPath)) {
      const child = resolve(targetPath, entry)
      if (!isIgnoredPath(child)) await collectFiles(child, files)
    }
    return
  }

  if (info.isFile() && isTextFile(targetPath) && !isIgnoredPath(targetPath)) {
    files.push(targetPath)
  }
}

export async function scanPaths(paths: string[], options?: ScanOptions): Promise<ScanResult> {
  const cwd = options?.cwd ?? process.cwd()
  const files: string[] = []
  for (const path of paths.length > 0 ? paths : ["."]) {
    await collectFiles(resolve(cwd, path), files)
  }

  files.sort()
  const diagnostics: Diagnostic[] = []
  for (const file of files) {
    diagnostics.push(...scanText(await readFile(file, "utf8"), file, options))
  }

  return { diagnostics, filesScanned: files.length }
}
