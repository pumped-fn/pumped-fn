import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import ts from "typescript";

const args = process.argv.slice(2);

const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const root = resolve(option("--root") ?? process.cwd());
const base = option("--base");
const changedFilesPath = option("--changed-files");
const prJsonPath = option("--pr-json");
const expectedHead = option("--expect-head");

if (!base || !prJsonPath || !expectedHead) {
  process.stderr.write(
    "Usage: node scripts/check-public-contract.mjs --base <ref> [--changed-files <path>] --pr-json <path> --expect-head <sha> [--root <path>]\n",
  );
  process.exit(2);
}

const normalize = (value) => value.split(sep).join("/");
const fromRoot = (path) => normalize(relative(root, path));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sortBy = (items, key) => items.sort((left, right) => key(left).localeCompare(key(right)));

const packageDirectories = readdirSync(join(root, "pkg"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((lane) =>
    readdirSync(join(root, "pkg", lane.name), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, "pkg", lane.name, entry.name)),
  )
  .filter((directory) => existsSync(join(directory, "package.json")))
  .map((directory) => ({ directory, manifest: readJson(join(directory, "package.json")) }))
  .filter(({ manifest }) => manifest.private !== true);
const packagesByName = new Map(packageDirectories.map((entry) => [entry.manifest.name, entry]));
const basePackageDirectories = execFileSync("git", ["ls-tree", "-r", "--name-only", base, "--", "pkg"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter((path) => /^pkg\/[^/]+\/[^/]+\/package\.json$/u.test(path))
  .map((path) => ({
    manifest: JSON.parse(execFileSync("git", ["show", `${base}:${path}`], { cwd: root, encoding: "utf8" })),
    path,
  }))
  .filter(({ manifest }) => manifest.private !== true);
const basePackagesByName = new Map(basePackageDirectories.map((entry) => [entry.manifest.name, entry]));

const escapeRegExp = (value) => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

const matchesFilePattern = (path, pattern) => {
  const normalizedPath = path.replace(/^\.\//, "");
  const normalizedPattern = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  if (!/[?*]/.test(normalizedPattern)) {
    return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
  }
  const expression = normalizedPattern
    .split("**")
    .map((part) => escapeRegExp(part).replace(/\*/g, "[^/]*").replace(/\\\?/g, "[^/]"))
    .join(".*");
  return new RegExp(`^${expression}(?:/.*)?$`).test(normalizedPath);
};

const isPacked = (manifest, path) => {
  const normalized = path.replace(/^\.\//, "");
  if (/^(?:package\.json|readme(?:\.[^/]*)?|licen[cs]e(?:\.[^/]*)?)$/i.test(normalized)) return true;
  if (manifest.main?.replace(/^\.\//, "") === normalized) return true;
  if (!manifest.files) return true;
  return manifest.files.some((pattern) => matchesFilePattern(normalized, pattern));
};

const targetRows = (value, conditions = [], rows = []) => {
  if (typeof value === "string") {
    rows.push({ path: value, kind: conditions.includes("types") ? "type" : "runtime" });
    return rows;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => targetRows(entry, conditions, rows));
    return rows;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([condition, entry]) => targetRows(entry, [...conditions, condition], rows));
  }
  return rows;
};

const exportRows = packageDirectories.flatMap(({ directory, manifest }) =>
  Object.entries(manifest.exports ?? {}).map(([exportKey, value]) => ({
    directory,
    manifest,
    exportKey,
    targets: targetRows(value),
  })),
);

const exportRemovalCandidates = [];
for (const { manifest: previous } of basePackageDirectories) {
  const current = packagesByName.get(previous.name)?.manifest;
  if (!current) continue;
  const currentExports = new Set(Object.keys(current.exports ?? {}));
  for (const exportKey of Object.keys(previous.exports ?? {})) {
    if (!currentExports.has(exportKey)) {
      exportRemovalCandidates.push({
        package: previous.name,
        export: exportKey,
        previous_version: previous.version,
        current_version: current.version,
      });
    }
  }
}

const missingRuntimeTargets = [];
const missingTypeTargets = [];
const packedFileOmissions = [];

for (const row of exportRows) {
  const packagePath = fromRoot(row.directory);
  const runtimeTargets = row.targets.filter(({ kind }) => kind === "runtime");
  const typeTargets = row.targets.filter(({ kind }) => kind === "type");
  if (runtimeTargets.length === 0) {
    missingRuntimeTargets.push({ package: row.manifest.name, export: row.exportKey, target: null, reason: "not_declared" });
  }
  if (typeTargets.length === 0) {
    missingTypeTargets.push({ package: row.manifest.name, export: row.exportKey, target: null, reason: "not_declared" });
  }
  for (const target of row.targets) {
    const path = target.path.replace(/^\.\//, "");
    if (!existsSync(join(row.directory, path))) {
      (target.kind === "type" ? missingTypeTargets : missingRuntimeTargets).push({
        package: row.manifest.name,
        export: row.exportKey,
        target: target.path,
        reason: "missing",
      });
    }
    if (!isPacked(row.manifest, path)) {
      packedFileOmissions.push({
        package: row.manifest.name,
        export: row.exportKey,
        target: target.path,
        source: `${packagePath}/package.json`,
      });
    }
  }
}

const changesetFiles = readdirSync(join(root, ".changeset"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => {
    const path = join(root, ".changeset", entry.name);
    return { content: readFileSync(path, "utf8"), path, recovered: false };
  });
const currentChangesetPaths = new Set(changesetFiles.map(({ path }) => normalize(relative(root, path))));
const baseChangesetPaths = execFileSync("git", ["ls-tree", "-r", "--name-only", base, "--", ".changeset"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter((path) => /^\.changeset\/[^/]+\.md$/u.test(path) && path !== ".changeset/README.md");
for (const path of baseChangesetPaths) {
  if (currentChangesetPaths.has(path)) continue;
  changesetFiles.push({
    content: execFileSync("git", ["show", `${base}:${path}`], { cwd: root, encoding: "utf8" }),
    path: join(root, path),
    recovered: true,
  });
}
const changesets = changesetFiles.flatMap(({ content, path, recovered }) => {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
  return frontmatter.split(/\r?\n/u).flatMap((line) => {
    const match = line.match(/^\s*["']?([^"']+?)["']?\s*:\s*(major|minor|patch)\s*$/u);
    return match ? [{ package: match[1], bump: match[2], path: fromRoot(path), recovered }] : [];
  });
});
const retiredPackages = new Set(changesetFiles.flatMap(({ content }) =>
  [...content.matchAll(/^Retires:\s*["']?([^"'\s]+)["']?\s*$/gimu)].map((match) => match[1]),
));
const majorChangesetPackages = new Set(changesets
  .filter(({ bump, recovered }) => bump === "major" && !recovered)
  .map(({ package: name }) => name));
const majorOf = (version) => Number.parseInt(String(version).split(".")[0], 10);
const packageExportRemovalGaps = exportRemovalCandidates
  .filter(({ package: name, previous_version, current_version }) =>
    !majorChangesetPackages.has(name) && majorOf(current_version) <= majorOf(previous_version)
  );

const changedFiles = changedFilesPath
  ? readJson(resolve(root, changedFilesPath))
  : execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
const packagesByPath = new Map(packageDirectories.map((entry) => [fromRoot(entry.directory), entry]));
const changedPackages = [...new Set(changedFiles.flatMap((path) => {
  const match = normalize(path).match(/^(pkg\/[^/]+\/[^/]+)\/src\//u);
  return match && packagesByPath.has(match[1]) ? [match[1]] : [];
}))].sort();
const changedWithoutChangeset = changedPackages.flatMap((path) => {
  const { manifest } = packagesByPath.get(path);
  return changesets.some((entry) => entry.package === manifest.name)
    ? []
    : [{ package: manifest.name, path }];
});
const currentPackageNames = new Set(packageDirectories.map(({ manifest }) => manifest.name));
const packageRetirementGaps = basePackageDirectories
  .filter(({ manifest }) => !currentPackageNames.has(manifest.name) && !retiredPackages.has(manifest.name))
  .map(({ manifest, path }) => ({ package: manifest.name, path }));

const packageReadmeGaps = [];
const packageChangelogGaps = [];
const majorMigrationEvidenceGaps = [];
const documentationExampleFailures = [];
const currentGuidanceExecGaps = [];

const collectMarkdown = (path) => {
  if (!existsSync(path)) return [];
  const entries = readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const target = join(path, entry.name);
    if (entry.isDirectory()) return collectMarkdown(target);
    return entry.isFile() && entry.name.endsWith(".md") && entry.name !== "CHANGELOG.md" ? [target] : [];
  });
};

const guidancePaths = [...new Set([
  join(root, "README.md"),
  join(root, "scripts", "README.md"),
  ...["docs", "examples", "skills", "pkg"].flatMap((path) => collectMarkdown(join(root, path))),
].filter(existsSync))];

const propertyName = (member) => {
  if (ts.isPropertyAssignment(member) || ts.isMethodDeclaration(member) || ts.isShorthandPropertyAssignment(member)) {
    return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : undefined;
  }
  return undefined;
};

const inspectGuidanceFence = (source, path, fence) => {
  const file = ts.createSourceFile(`${path}.tsx`, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ((node.expression.expression.getText(file) === "ctx" && node.expression.name.text === "exec")
        || (node.expression.expression.getText(file) === "scope" && node.expression.name.text === "run"))
      && node.arguments.length > 0
      && ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const options = node.arguments[0];
      const properties = new Map(options.properties.map((member) => [propertyName(member), member]));
      if (properties.has("fn")) {
        const required = ["name", "params", "fn"];
        const missing = required.filter((name) => !properties.has(name));
        const fn = properties.get("fn");
        const callback = ts.isPropertyAssignment(fn) ? fn.initializer : undefined;
        const first = callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
          ? callback.parameters[0]?.name.getText(file)
          : undefined;
        const callbackArgument = first && /^(?:_?ctx|_?scope)$/u.test(first) ? first : undefined;
        if (missing.length > 0 || callbackArgument) {
          const position = file.getLineAndCharacterOfPosition(node.getStart(file));
          currentGuidanceExecGaps.push({
            path: fromRoot(path),
            fence,
            line: position.line + 1,
            receiver: node.expression.expression.getText(file),
            missing,
            ...(callbackArgument ? { callback_argument: callbackArgument } : {}),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
};

for (const path of guidancePaths) {
  const content = readFileSync(path, "utf8");
  const fences = [...content.matchAll(/```(ts|typescript|tsx)\s*\r?\n([\s\S]*?)```/giu)];
  fences.forEach((match, index) => {
    const lead = content.slice(Math.max(0, match.index - 240), match.index);
    if (!/(?:^|\n)(?:Before|Legacy|Removed)\b[^\n]*:?\s*$/imu.test(lead)) {
      inspectGuidanceFence(match[2], path, index + 1);
    }
  });
  [...content.matchAll(/`((?:ctx\.exec|scope\.run)\(\{[^`\n]*\}\))`/gu)].forEach((match) => {
    if (!/\bfn\b/u.test(match[1])) return;
    const missing = ["name", "params", "fn"].filter((name) => !new RegExp(`\\b${name}\\b`, "u").test(match[1]));
    if (missing.length === 0) return;
    currentGuidanceExecGaps.push({
      path: fromRoot(path),
      fence: null,
      line: content.slice(0, match.index).split(/\r?\n/u).length,
      receiver: match[1].startsWith("ctx.") ? "ctx" : "scope",
      missing,
    });
  });
}

for (const { directory, manifest } of packageDirectories) {
  const readme = join(directory, "README.md");
  const changelog = join(directory, "CHANGELOG.md");
  if (!existsSync(readme)) packageReadmeGaps.push({ package: manifest.name, path: fromRoot(readme) });
  if (!existsSync(changelog)) packageChangelogGaps.push({ package: manifest.name, path: fromRoot(changelog) });
  if (existsSync(changelog) && !isPacked(manifest, "CHANGELOG.md")) {
    packedFileOmissions.push({ package: manifest.name, export: null, target: "./CHANGELOG.md", source: `${fromRoot(directory)}/package.json` });
  }
  if (existsSync(readme)) {
    const content = readFileSync(readme, "utf8");
    const fences = [...content.matchAll(/```(ts|typescript|tsx)\s*\r?\n([\s\S]*?)```/giu)];
    fences.forEach((match, index) => {
      const diagnostics = ts.transpileModule(match[2], {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
        },
        fileName: `${readme}.${match[1].toLowerCase()}`,
        reportDiagnostics: true,
      }).diagnostics?.filter(({ category }) => category === ts.DiagnosticCategory.Error) ?? [];
      if (diagnostics.length > 0) {
        documentationExampleFailures.push({
          package: manifest.name,
          path: fromRoot(readme),
          fence: index + 1,
          language: match[1].toLowerCase(),
          diagnostics: diagnostics.map((diagnostic) => ({
            code: diagnostic.code,
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
          })),
        });
      }
    });
  }
  for (const change of changesets.filter((entry) => entry.package === manifest.name && entry.bump === "major")) {
    const previous = basePackagesByName.get(manifest.name)?.manifest;
    const currentMajor = Number.parseInt(String(manifest.version).split(".")[0], 10);
    const previousMajor = previous
      ? Number.parseInt(String(previous.version).split(".")[0], 10)
      : currentMajor;
    const targetMajor = previousMajor + 1;
    const migrationPaths = [join(directory, "MIGRATION.md"), readme].filter(existsSync);
    const versionPattern = new RegExp(`(?:${targetMajor}\\.0\\.0|v${targetMajor}\\b|to\\s+${targetMajor}\\b)`, "iu");
    const evidence = migrationPaths.find((path) => {
      const content = readFileSync(path, "utf8");
      return /migration/iu.test(content) && versionPattern.test(content);
    });
    if (!evidence) {
      majorMigrationEvidenceGaps.push({ package: manifest.name, target_major: targetMajor, changeset: change.path });
    } else if (!isPacked(manifest, relative(directory, evidence))) {
      packedFileOmissions.push({ package: manifest.name, export: null, target: `./${normalize(relative(directory, evidence))}`, source: `${fromRoot(directory)}/package.json` });
    }
  }
}

const typeTargetRows = exportRows.flatMap((row) =>
  row.targets
    .filter(({ kind, path }) => kind === "type" && existsSync(join(row.directory, path.replace(/^\.\//, ""))))
    .map(({ path }) => ({ ...row, path: join(row.directory, path.replace(/^\.\//, "")) })),
);
const program = ts.createProgram(typeTargetRows.map(({ path }) => path), {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true,
  target: ts.ScriptTarget.ESNext,
});
const checker = program.getTypeChecker();
const exportedSymbolsByKey = new Map();

for (const row of typeTargetRows) {
  const source = program.getSourceFile(row.path);
  const module = source && checker.getSymbolAtLocation(source);
  if (!module) continue;
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const declarations = symbol.declarations ?? exported.declarations ?? [];
    const documented = declarations.some((declaration) => ts.getJSDocCommentsAndTags(declaration).length > 0);
    const interfaceDeclaration = declarations.some(ts.isInterfaceDeclaration);
    const key = `${row.manifest.name}\0${row.exportKey}\0${exported.name}`;
    const current = exportedSymbolsByKey.get(key);
    exportedSymbolsByKey.set(key, {
      package: row.manifest.name,
      export: row.exportKey,
      symbol: exported.name,
      declarations: [...new Set([
        ...(current?.declarations ?? []),
        ...declarations.map((declaration) => ts.SyntaxKind[declaration.kind]),
      ])].sort(),
      documented: documented || current?.documented === true,
      interface: interfaceDeclaration || current?.interface === true,
    });
  }
}

const exportedSymbols = [...exportedSymbolsByKey.values()];
sortBy(exportedSymbols, (entry) => `${entry.package}\0${entry.export}\0${entry.symbol}`);
const exportedSymbolTsdocGaps = exportedSymbols.filter(({ documented }) => !documented);
const publicInterfaces = exportedSymbols.filter((entry) => entry.interface);
const publicApiTsdocGaps = publicInterfaces.filter(({ documented }) => !documented);
const pr = readJson(resolve(root, prJsonPath));
const actualHead = pr.headRefOid ?? pr.head?.sha ?? pr.pull_request?.head?.sha ?? null;
const checkoutHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const snapshotPath = normalize(relative(root, resolve(root, prJsonPath)));
const prSnapshotGaps = [
  ...(actualHead === checkoutHead ? [] : [{
    kind: "pr_head_checkout_mismatch",
    expected_head: checkoutHead,
    actual_head: actualHead,
    path: snapshotPath,
  }]),
  ...(expectedHead === checkoutHead ? [] : [{
    kind: "expected_head_checkout_mismatch",
    expected_head: checkoutHead,
    actual_head: expectedHead,
    path: snapshotPath,
  }]),
];

const details = {
  changed_public_source_packages_without_changeset: changedWithoutChangeset,
  current_guidance_exec_gaps: currentGuidanceExecGaps,
  documentation_example_failures: documentationExampleFailures,
  exported_symbol_tsdoc_gaps: exportedSymbolTsdocGaps,
  major_migration_evidence_gaps: majorMigrationEvidenceGaps,
  missing_runtime_targets: missingRuntimeTargets,
  missing_type_targets: missingTypeTargets,
  package_changelog_gaps: packageChangelogGaps,
  package_readme_gaps: packageReadmeGaps,
  package_export_removal_gaps: packageExportRemovalGaps,
  package_retirement_gaps: packageRetirementGaps,
  packed_file_omissions: packedFileOmissions,
  pr_snapshot_gaps: prSnapshotGaps,
  public_api_tsdoc_gaps: publicApiTsdocGaps,
};

Object.values(details).forEach((items) => sortBy(items, (entry) => JSON.stringify(entry)));

const metrics = {
  changed_public_source_package_count: changedPackages.length,
  changed_public_source_package_without_changeset_count: changedWithoutChangeset.length,
  current_guidance_exec_gap_count: currentGuidanceExecGaps.length,
  documentation_example_failure_count: documentationExampleFailures.length,
  exported_symbol_count: exportedSymbols.length,
  exported_symbol_tsdoc_gap_count: exportedSymbolTsdocGaps.length,
  major_migration_evidence_gap_count: majorMigrationEvidenceGaps.length,
  missing_runtime_target_count: missingRuntimeTargets.length,
  missing_type_target_count: missingTypeTargets.length,
  package_changelog_gap_count: packageChangelogGaps.length,
  package_export_removal_gap_count: packageExportRemovalGaps.length,
  package_readme_gap_count: packageReadmeGaps.length,
  package_retirement_gap_count: packageRetirementGaps.length,
  packed_file_omission_count: packedFileOmissions.length,
  pr_snapshot_gap_count: prSnapshotGaps.length,
  public_api_interface_count: publicInterfaces.length,
  public_api_tsdoc_gap_count: publicApiTsdocGaps.length,
  public_export_row_count: exportRows.length,
  public_package_count: packageDirectories.length,
};

metrics.public_contract_gap_count = [
  metrics.changed_public_source_package_without_changeset_count,
  metrics.current_guidance_exec_gap_count,
  metrics.documentation_example_failure_count,
  metrics.major_migration_evidence_gap_count,
  metrics.missing_runtime_target_count,
  metrics.missing_type_target_count,
  metrics.package_changelog_gap_count,
  metrics.package_export_removal_gap_count,
  metrics.package_readme_gap_count,
  metrics.package_retirement_gap_count,
  metrics.packed_file_omission_count,
  metrics.pr_snapshot_gap_count,
  metrics.public_api_tsdoc_gap_count,
].reduce((total, count) => total + count, 0);

const result = {
  schema_version: 1,
  ok: metrics.public_contract_gap_count === 0,
  head: { checkout: checkoutHead, pr: actualHead, expected: expectedHead },
  metrics,
  details,
};

process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
