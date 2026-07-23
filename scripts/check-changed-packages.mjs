import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const base = process.argv[2] ?? process.env.BASE_REF;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (!base || base.match(/^0+$/)) {
  process.stderr.write("Usage: node scripts/check-changed-packages.mjs <base-ref> or set BASE_REF\n");
  process.exit(2);
}

const files = changedFiles(base);
const packageDirs = [
  ...new Set(
    files
      .map((file) => file.match(/^pkg\/[^/]+\/[^/]+\//)?.[0])
      .filter((value) => value !== undefined)
      .map((value) => value.slice(0, -1)),
  ),
].sort();

const currentPackages = currentPackageInventory();
const currentPackagesByName = new Map(currentPackages.map((pkg) => [pkg.name, pkg]));
const basePackages = basePackageInventory();
const retiredPackages = new Set(readdirSync(join(root, ".changeset"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .flatMap((entry) =>
    [...readFileSync(join(root, ".changeset", entry.name), "utf8")
      .matchAll(/^Retires:\s*["']?([^"'\s]+)["']?\s*$/gimu)]
      .map((match) => match[1])
  ));
const deletedPackages = basePackages.filter((pkg) => !currentPackagesByName.has(pkg.name));
const missingRetirements = deletedPackages.filter((pkg) => !retiredPackages.has(pkg.name));

if (missingRetirements.length > 0) {
  throw new Error(`Deleted public packages require explicit retirement evidence: ${missingRetirements
    .map(({ name }) => name)
    .sort()
    .join(", ")}`);
}

for (const { name, path } of deletedPackages) {
  console.log(`Retired public package ${name} from ${path}.`);
}

const packages = packageDirs
  .map((path) => packageAt(path))
  .filter((pkg) => pkg !== undefined && pkg.private !== true);

if (packages.length === 0) {
  console.log("No changed public packages.");
  process.exit(0);
}

for (const pkg of packages) {
  console.log(`Rebuilding ${pkg.name} from ${relative(root, pkg.path)}`);
  execFileSync(pnpm, ["--filter", `${pkg.name}...`, "build"], {
    cwd: root,
    stdio: "inherit",
  });

  if (published(pkg.name, pkg.version)) {
    console.log(`Skipping publish dry-run for ${pkg.name}@${pkg.version}; version already exists.`);
    continue;
  }

  console.log(`Running publish dry-run for ${pkg.name}@${pkg.version}`);
  execFileSync(npm, ["publish", "--dry-run", "--access", "public", "--json"], {
    cwd: pkg.path,
    stdio: "inherit",
  });
}

function changedFiles(ref) {
  return execFileSync("git", ["diff", "--name-only", `${ref}...HEAD`], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

function packageAt(path) {
  const file = join(root, path, "package.json");

  if (!existsSync(file)) {
    return undefined;
  }

  const pkg = JSON.parse(readFileSync(file, "utf8"));

  return {
    name: pkg.name,
    version: pkg.version,
    private: pkg.private,
    path: dirname(file),
  };
}

function currentPackageInventory() {
  return readdirSync(join(root, "pkg"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((lane) =>
      readdirSync(join(root, "pkg", lane.name), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => packageAt(`pkg/${lane.name}/${entry.name}`))
    )
    .filter((pkg) => pkg !== undefined && pkg.private !== true);
}

function basePackageInventory() {
  return execFileSync("git", ["ls-tree", "-r", "--name-only", base, "--", "pkg"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((path) => /^pkg\/[^/]+\/[^/]+\/package\.json$/u.test(path))
    .map((file) => {
      const pkg = JSON.parse(execFileSync("git", ["show", `${base}:${file}`], { cwd: root, encoding: "utf8" }));
      return { ...pkg, path: dirname(file) };
    })
    .filter((pkg) => pkg.private !== true);
}

function published(name, version) {
  const view = spawnSync(npm, ["view", `${name}@${version}`, "version", "--json"], {
    cwd: root,
    encoding: "utf8",
  });

  if (view.status === 0) {
    return true;
  }

  const output = `${view.stdout}\n${view.stderr}`;

  if (output.includes("E404") || output.includes("not found")) {
    return false;
  }

  throw new Error(output.trim());
}
