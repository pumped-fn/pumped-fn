import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..");
const dtsPath = path.resolve(pkgRoot, "dist/index.d.mts");

if (!fs.existsSync(dtsPath)) {
  console.error(`Missing ${dtsPath}. Build the package first.`);
  process.exitCode = 1;
  process.exit();
}

const sourceText = fs.readFileSync(dtsPath, "utf8");
const source = ts.createSourceFile(
  dtsPath,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
);

const exportableKinds = new Set([
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
]);

const exportedStatements = source.statements.filter((statement) => {
  if (!exportableKinds.has(statement.kind)) {
    return false;
  }
  return (
    statement.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ??
    false
  );
});

const failures = [];

const getName = (node) => {
  if ("name" in node && node.name) {
    return node.name.getText(source);
  }
  if (ts.isVariableStatement(node)) {
    const decl = node.declarationList.declarations[0];
    return decl?.name.getText(source) ?? "<anonymous>";
  }
  return "<anonymous>";
};

for (const statement of exportedStatements) {
  const jsDoc = ts.getJSDocCommentsAndTags(statement);
  if (jsDoc.length > 0) {
    continue;
  }

  const { line, character } = source.getLineAndCharacterOfPosition(
    statement.getStart()
  );
  failures.push(
    `${getName(statement)} missing docs at ${path.relative(
      process.cwd(),
      dtsPath
    )}:${line + 1}:${character + 1}`
  );
}

if (failures.length > 0) {
  console.error("Documentation missing for exported declarations:");
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exitCode = 1;
  process.exit();
}

console.log("All exported declarations in dist/index.d.mts include TSDoc.");
