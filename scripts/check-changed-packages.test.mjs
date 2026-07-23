import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";

const root = process.cwd();
const script = join(root, "scripts", "check-changed-packages.mjs");
const temporary = [];

const write = (directory, path, value) => {
  const target = join(directory, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
};

const fixture = ({ move = false, retire = false } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "pumped-changed-package-"));
  temporary.push(directory);
  write(directory, "pkg/core/demo/package.json", "{\"name\":\"@fixture/demo\",\"version\":\"1.0.0\"}\n");
  write(directory, ".changeset/README.md", "# Changesets\n");
  execFileSync("git", ["init", "-q"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: directory });
  execFileSync("git", ["add", "."], { cwd: directory });
  execFileSync("git", ["commit", "-qm", "baseline"], { cwd: directory });
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();

  if (move) {
    mkdirSync(join(directory, "pkg/ext"), { recursive: true });
    renameSync(join(directory, "pkg/core/demo"), join(directory, "pkg/ext/demo"));
  } else {
    rmSync(join(directory, "pkg/core/demo"), { recursive: true });
  }
  if (retire) write(directory, ".changeset/retire.md", "---\n---\n\nRetires: @fixture/demo\n");
  execFileSync("git", ["add", "-A"], { cwd: directory });
  execFileSync("git", ["commit", "-qm", move ? "move package" : "delete package"], { cwd: directory });

  const bin = join(directory, "bin");
  write(directory, "bin/pnpm", "#!/bin/sh\nexit 0\n");
  write(directory, "bin/npm", "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "pnpm"), 0o755);
  chmodSync(join(bin, "npm"), 0o755);
  return { base, bin, directory };
};

const run = (options) => {
  const { base, bin, directory } = fixture(options);
  return spawnSync(process.execPath, [script, base], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
  });
};

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop(), { recursive: true, force: true });
});

describe("changed package identity", () => {
  it("treats a public package path move as the same package", () => {
    const result = run({ move: true });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Rebuilding @fixture\/demo from pkg\/ext\/demo/u);
    assert.doesNotMatch(result.stdout, /Retired public package/u);
  });

  it("rejects a true deletion without retirement evidence", () => {
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Deleted public packages require explicit retirement evidence: @fixture\/demo/u);
  });

  it("reports a true deletion with explicit retirement evidence", () => {
    const result = run({ retire: true });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Retired public package @fixture\/demo from pkg\/core\/demo/u);
  });
});
