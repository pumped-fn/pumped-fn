import { readdir, readFile, stat } from "node:fs/promises"
import { basename, extname, resolve } from "node:path"
import ts from "typescript"

export type RuleId =
  | "pumped/no-ambient-io-outside-boundary"
  | "pumped/no-definition-handle-suffix"
  | "pumped/no-direct-flow-composition"
  | "pumped/no-internal-example-label"
  | "pumped/no-jsdom-backend"
  | "pumped/no-module-mocks"
  | "pumped/no-render-outside-browser-test"
  | "pumped/no-react-local-state"
  | "pumped/no-react-manual-execution-context"
  | "pumped/no-react-use-execution-context"
  | "pumped/no-react-use-scope"
  | "pumped/no-scope-argument"
  | "pumped/no-shared-scope-factory"
  | "pumped/no-test-only-branches"

export interface Diagnostic {
  ruleId: RuleId
  filePath: string
  line: number
  column: number
  message: string
}

export interface ScanResult {
  diagnostics: Diagnostic[]
  filesScanned: number
}

export interface ScanOptions {
  cwd?: string
}

type Imports = {
  createScope: Set<string>
  controller: Set<string>
  creators: Set<string>
  flow: Set<string>
  liteNamespaces: Set<string>
  liteReactNamespaces: Set<string>
  mockFns: Set<string>
  reactNamespaces: Set<string>
  render: Set<string>
  testLibraryNamespaces: Set<string>
  useExecutionContext: Set<string>
  useScope: Set<string>
  useState: Set<string>
  viObjects: Set<string>
}

const creatorNames = new Set(["atom", "flow", "resource", "tag", "scopedValue"])
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

function isCompositionPath(filePath: string): boolean {
  return compositionPathPattern.test(normalizePath(filePath))
}

function isReactFeaturePath(filePath: string): boolean {
  return extname(filePath).endsWith("x") && !isTestPath(filePath) && !isCompositionPath(filePath)
}

function isAmbientAllowedPath(filePath: string): boolean {
  const normalized = normalizePath(filePath)
  return isTestPath(normalized) || isCompositionPath(normalized) || /(?:^|\/)(?:infra|transport|adapters?)\//.test(normalized)
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
  diagnostics.push({ ruleId, filePath, ...textLocation(source, index), message })
}

function pushNodeDiagnostic(
  diagnostics: Diagnostic[],
  sourceFile: ts.SourceFile,
  filePath: string,
  ruleId: RuleId,
  node: ts.Node,
  message: string,
): void {
  diagnostics.push({ ruleId, filePath, ...nodeLocation(sourceFile, node), message })
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
    controller: new Set(),
    creators: new Set(),
    flow: new Set(),
    liteNamespaces: new Set(),
    liteReactNamespaces: new Set(),
    mockFns: new Set(),
    reactNamespaces: new Set(),
    render: new Set(),
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
    if (!clause?.namedBindings) continue

    if (ts.isNamespaceImport(clause.namedBindings)) {
      if (moduleName === "@pumped-fn/lite") imports.liteNamespaces.add(clause.namedBindings.name.text)
      if (moduleName === "@pumped-fn/lite-react") imports.liteReactNamespaces.add(clause.namedBindings.name.text)
      if (moduleName === "react") imports.reactNamespaces.add(clause.namedBindings.name.text)
      if (moduleName === "@testing-library/react") imports.testLibraryNamespaces.add(clause.namedBindings.name.text)
      continue
    }

    for (const specifier of clause.namedBindings.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text
      const local = specifier.name.text
      if (moduleName === "@pumped-fn/lite" && imported === "createScope") {
        imports.createScope.add(local)
      }
      if (moduleName === "@pumped-fn/lite" && imported === "controller") {
        imports.controller.add(local)
      }
      if (moduleName === "@pumped-fn/lite" && imported === "flow") {
        imports.flow.add(local)
      }
      if ((moduleName === "@pumped-fn/lite" || moduleName === "@pumped-fn/lite-react") && creatorNames.has(imported)) {
        imports.creators.add(local)
      }
      if (moduleName === "@testing-library/react" && imported === "render") {
        imports.render.add(local)
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
    }
  }

  return imports
}

function calledName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return null
}

function isNamespaceCall(expression: ts.Expression, namespaces: Set<string>, name: string): boolean {
  return ts.isPropertyAccessExpression(expression)
    && expression.name.text === name
    && ts.isIdentifier(expression.expression)
    && namespaces.has(expression.expression.text)
}

function isCreatorCall(expression: ts.Expression, imports: Imports): boolean {
  if (ts.isIdentifier(expression)) return imports.creators.has(expression.text)
  if (!ts.isPropertyAccessExpression(expression) || !creatorNames.has(expression.name.text)) return false
  if (!ts.isIdentifier(expression.expression)) return false
  return imports.liteNamespaces.has(expression.expression.text) || imports.liteReactNamespaces.has(expression.expression.text)
}

function isFlowCall(expression: ts.Expression, imports: Imports): boolean {
  if (ts.isIdentifier(expression)) return imports.flow.has(expression.text)
  return isNamespaceCall(expression, imports.liteNamespaces, "flow")
}

function isCreateScopeCall(expression: ts.Expression, imports: Imports): boolean {
  if (ts.isIdentifier(expression)) return imports.createScope.has(expression.text)
  return isNamespaceCall(expression, imports.liteNamespaces, "createScope")
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

function ambientAllowedAt(node: ts.Node, filePath: string): boolean {
  if (isAmbientAllowedPath(filePath)) return true
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

function shouldScanAst(filePath: string): boolean {
  return isSourceFile(filePath)
}

function addAstDiagnostics(source: string, filePath: string, diagnostics: Diagnostic[]): void {
  if (!shouldScanAst(filePath)) return

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    extname(filePath).endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const imports = collectImports(sourceFile)
  const reactFeature = isReactFeaturePath(filePath)
  const allowScopeArgument = isTestPath(filePath) || isCompositionPath(filePath)
  const allowScopeFactory = isCompositionPath(filePath)
  const localFlows = new Set<string>()

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const name = calledName(node.expression)
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

      if (isAmbientCall(node.expression) && !ambientAllowedAt(node, filePath)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-ambient-io-outside-boundary",
          node.expression,
          "Raw ambient IO belongs in transport atoms or composition-root adapters.",
        )
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

    if (!allowScopeArgument) {
      if (ts.isFunctionDeclaration(node) && exported(node) && hasScopeParameter(node.parameters)) {
        pushNodeDiagnostic(
          diagnostics,
          sourceFile,
          filePath,
          "pumped/no-scope-argument",
          node.name ?? node,
          "Product helpers should not accept scope; composition roots and tests own scope creation.",
        )
      }

      if (
        ts.isVariableDeclaration(node)
        && node.initializer
        && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
        && hasScopeParameter(node.initializer.parameters)
        && exported(variableStatement(node) ?? node)
      ) {
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

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

export function scanText(source: string, filePath: string, _options?: ScanOptions): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  addTextDiagnostics(source, filePath, diagnostics)
  addAstDiagnostics(source, filePath, diagnostics)
  return diagnostics
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
