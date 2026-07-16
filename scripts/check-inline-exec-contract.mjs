import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import process from "node:process";
import ts from "typescript";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const root = resolve(option("--root") ?? process.cwd());
const expectedHead = option("--expect-head");

if (!expectedHead) {
  process.stderr.write("Usage: node scripts/check-inline-exec-contract.mjs --expect-head <sha> [--root <path>]\n");
  process.exit(2);
}

const normalize = (value) => value.split(sep).join("/");
const ignored = new Set([".git", ".okra", "benchmarks", "coverage", "dist", "node_modules"]);
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const runtimeIntrinsics = new Set(["Array", "BigInt", "Boolean", "Date", "Error", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol"]);
const files = [];
const collect = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(path);
  }
};
collect(root);
const scannedFiles = files.filter((path) => !normalize(relative(root, path)).startsWith("scripts/fixtures/"));
scannedFiles.sort();

const details = {
  captured_dependencies: [],
  context_callback_arguments: [],
  ctx_scope_param_arguments: [],
  head_mismatches: [],
  legacy_inline_option_types: [],
  missing_name: [],
  missing_params: [],
  public_context_callback_types: [],
  uninspectable_callbacks: [],
};
let inlineExecCallsiteCount = 0;

const propertyName = (name) => ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
const property = (object, name) => object.properties.find((candidate) =>
  ts.isPropertyAssignment(candidate) && propertyName(candidate.name) === name
);
const location = (source, node) => {
  const point = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { path: normalize(relative(root, source.fileName)), line: point.line + 1, column: point.character + 1 };
};
const collectBindings = (name, target) => {
  if (ts.isIdentifier(name)) target.add(name.text);
  else for (const element of name.elements) if (ts.isBindingElement(element)) collectBindings(element.name, target);
};
const callbackCaptures = (callback) => {
  const declared = new Set();
  callback.parameters.forEach((parameter) => collectBindings(parameter.name, declared));
  if (callback.name) declared.add(callback.name.text);
  const declare = (node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) collectBindings(node.name, declared);
    else if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node)) && node.name) declared.add(node.name.text);
    ts.forEachChild(node, declare);
  };
  declare(callback.body);
  const references = new Set();
  const visit = (node) => {
    if (ts.isTypeNode(node)) return;
    if (ts.isPropertyAccessExpression(node)) return visit(node.expression);
    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) visit(node.name.expression);
      return visit(node.initializer);
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      references.add(node.name.text);
      return;
    }
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
      if (node.initializer) visit(node.initializer);
      return;
    }
    if (ts.isIdentifier(node)) references.add(node.text);
    else ts.forEachChild(node, visit);
  };
  visit(callback.body);
  return [...references].filter((name) => !declared.has(name) && !runtimeIntrinsics.has(name)).sort();
};
const unwrapCallback = (expression) => {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)
  ) current = current.expression;
  return current;
};
const lexicalScope = (node) => {
  let current = node.parent;
  while (current && !ts.isBlock(current) && !ts.isSourceFile(current) && !ts.isModuleBlock(current)) current = current.parent;
  return current;
};
const ctxScopeReferences = (node) => {
  const references = new Set();
  const visit = (child) => {
    if (ts.isTypeNode(child)) return;
    if (ts.isPropertyAccessExpression(child)) {
      if (
        /^(?:ctx|context|executionContext|scope)$/i.test(child.name.text)
        && !ts.isObjectLiteralExpression(child.expression)
      ) references.add(child.name.text);
      return;
    }
    if (ts.isPropertyAssignment(child)) {
      if (ts.isComputedPropertyName(child.name)) visit(child.name.expression);
      return visit(child.initializer);
    }
    if (ts.isIdentifier(child) && /^(?:ctx|context|executionContext|scope)$/i.test(child.text)) references.add(child.text);
    else ts.forEachChild(child, visit);
  };
  visit(node);
  return [...references].sort();
};
const isInlineReceiver = (expression) => {
  if (!ts.isPropertyAccessExpression(expression) || !["exec", "run"].includes(expression.name.text)) return false;
  if (ts.isIdentifier(expression.expression)) {
    return expression.name.text === "exec"
      ? /^(?:ctx|context|executionContext)$/i.test(expression.expression.text)
      : /^scope$/i.test(expression.expression.text);
  }
  return expression.name.text === "exec"
    && ts.isPropertyAccessExpression(expression.expression)
    && /^(?:ctx|context|executionContext)$/i.test(expression.expression.name.text);
};

for (const file of scannedFiles) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const callbacks = new Map();
  const collectCallbacks = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = unwrapCallback(node.initializer);
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        const entries = callbacks.get(node.name.text) ?? [];
        entries.push({ callback: initializer, declaration: node, scope: lexicalScope(node), hoisted: false });
        callbacks.set(node.name.text, entries);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const entries = callbacks.get(node.name.text) ?? [];
      entries.push({ callback: node, declaration: node, scope: lexicalScope(node), hoisted: true });
      callbacks.set(node.name.text, entries);
    }
    ts.forEachChild(node, collectCallbacks);
  };
  collectCallbacks(source);
  const resolveCallback = (expression) => {
    const direct = unwrapCallback(expression);
    if (ts.isArrowFunction(direct) || ts.isFunctionExpression(direct)) return direct;
    if (!ts.isIdentifier(direct)) return undefined;
    const position = direct.getStart(source);
    return (callbacks.get(direct.text) ?? [])
      .filter(({ declaration, scope, hoisted }) =>
        scope
        && scope.getStart(source) <= position
        && position < scope.getEnd()
        && (hoisted || declaration.getEnd() <= position)
      )
      .sort((left, right) => {
        const scopeOrder = right.scope.getStart(source) - left.scope.getStart(source);
        return scopeOrder || right.declaration.getStart(source) - left.declaration.getStart(source);
      })[0]?.callback;
  };
  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && isInlineReceiver(node.expression)
      && node.arguments[0]
      && ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const options = node.arguments[0];
      const fnProperty = property(options, "fn");
      if (fnProperty) {
        inlineExecCallsiteCount++;
        const at = location(source, node);
        for (const [name, target] of [["name", details.missing_name], ["params", details.missing_params]]) {
          if (!property(options, name)) target.push(at);
        }
        const callback = resolveCallback(fnProperty.initializer);
        if (callback) {
          const first = callback.parameters[0];
          if (first && ts.isIdentifier(first.name) && /^(?:_*ctx|_*context|_*executionContext|_*scope)$/i.test(first.name.text)) {
            details.context_callback_arguments.push({ ...location(source, first), parameter: first.name.text });
          }
          for (const capture of callbackCaptures(callback)) {
            details.captured_dependencies.push({ ...location(source, callback), capture });
          }
        } else {
          details.uninspectable_callbacks.push({
            ...location(source, fnProperty.initializer),
            callback: fnProperty.initializer.getText(source),
          });
        }
        const params = property(options, "params");
        if (params) for (const argument of ctxScopeReferences(params.initializer)) {
          details.ctx_scope_param_arguments.push({ ...location(source, params), argument });
        }
      }
    }
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      if (["ExecFnOptions", "RunFnOptions", "RunDepsOptions"].includes(node.name.text)) {
        details.legacy_inline_option_types.push({ ...location(source, node), type: node.name.text });
      }
    }
    if (ts.isFunctionTypeNode(node) && node.parameters[0] && ts.isIdentifier(node.parameters[0].name)) {
      const first = node.parameters[0];
      const typeText = first.type?.getText(source) ?? "";
      if (/^(?:ctx|context|executionContext|scope)$/i.test(first.name.text) && /(?:ExecutionContext|Scope)/u.test(typeText)) {
        let parent = node.parent;
        while (parent && !ts.isInterfaceDeclaration(parent) && !ts.isTypeAliasDeclaration(parent)) parent = parent.parent;
        if (parent && /(?:Exec|Run).*Options/u.test(parent.name.text)) {
          details.public_context_callback_types.push({ ...location(source, first), type: parent.name.text });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const actualHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (actualHead !== expectedHead) details.head_mismatches.push({ expected_head: expectedHead, actual_head: actualHead });
Object.values(details).forEach((rows) => rows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
const metrics = {
  captured_dependency_count: details.captured_dependencies.length,
  context_callback_argument_count: details.context_callback_arguments.length,
  ctx_scope_param_argument_count: details.ctx_scope_param_arguments.length,
  head_mismatch_count: details.head_mismatches.length,
  inline_exec_callsite_count: inlineExecCallsiteCount,
  legacy_inline_option_type_count: details.legacy_inline_option_types.length,
  missing_name_count: details.missing_name.length,
  missing_params_count: details.missing_params.length,
  public_context_callback_type_count: details.public_context_callback_types.length,
  uninspectable_callback_count: details.uninspectable_callbacks.length,
};
metrics.inline_exec_contract_gap_count = Object.entries(metrics)
  .filter(([name]) => name !== "inline_exec_callsite_count" && name !== "inline_exec_contract_gap_count")
  .reduce((total, [, value]) => total + value, 0);
process.stdout.write(`${JSON.stringify({ metrics, details }, null, 2)}\n`);
process.exit(metrics.inline_exec_contract_gap_count === 0 ? 0 : 1);
