import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const initialBase = process.argv[2] ?? process.env.BASE_REF ?? "origin/main";
const base = initialBase.match(/^0+$/) ? "origin/main" : initialBase;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const files = changedFiles(base);
const packageDirs = [
  ...new Set(
    files
      .map((file) => file.match(/^pkg\/[^/]+\/[^/]+\//)?.[0])
      .filter((value) => value !== undefined)
      .map((value) => value.slice(0, -1)),
  ),
].sort();

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
  try {
    return execFileSync("git", ["diff", "--name-only", `${ref}...HEAD`], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    if (ref === "origin/main") {
      throw error;
    }

    return changedFiles("origin/main");
  }
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
