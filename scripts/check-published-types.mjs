import { execFile } from "node:child_process"
import { globSync } from "node:fs"
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)
const repo = resolve(import.meta.dirname, "..")
const leaked = globSync("packages/*/src/**/*.d.ts", { cwd: repo }).sort()
if (leaked.length) throw new Error(`source declaration leak:\n${leaked.join("\n")}`)
const root = await mkdtemp(join(tmpdir(), "pumped-published-types-"))

try {
  const packages = await Promise.all(
    globSync("packages/*/package.json", { cwd: repo })
      .sort()
      .map(async (file) => ({
        directory: dirname(resolve(repo, file)),
        manifest: JSON.parse(await readFile(resolve(repo, file), "utf8")),
      }))
  )
  const published = packages.filter(({ manifest }) => !manifest.private)
  const commonjs = published.filter(({ manifest }) =>
    hasCondition(manifest.exports?.["."] ?? manifest.exports, "require")
  )

  for (const { directory, manifest } of published) {
    const destination = resolve(root, "node_modules", ...manifest.name.split("/"))
    await mkdir(dirname(destination), { recursive: true })
    await symlink(directory, destination, "dir")
  }
  const linked = new Set(published.map(({ manifest }) => manifest.name))
  for (const { directory, manifest } of published) {
    for (const name of Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    })) {
      if (linked.has(name)) continue
      const source = resolve(directory, "node_modules", ...name.split("/"))
      try {
        await access(source)
      } catch {
        continue
      }
      const destination = resolve(root, "node_modules", ...name.split("/"))
      await mkdir(dirname(destination), { recursive: true })
      await symlink(source, destination, "dir")
      linked.add(name)
    }
  }

  await writeFile(resolve(root, "package.json"), JSON.stringify({ type: "module" }))
  await writeFile(resolve(root, "all.mts"), published
    .map(({ manifest }, index) => `import * as p${index} from ${JSON.stringify(manifest.name)}\nvoid p${index}`)
    .join("\n"))
  await writeFile(resolve(root, "all.cts"), commonjs
    .map(({ manifest }, index) => `import p${index} = require(${JSON.stringify(manifest.name)})\nvoid p${index}`)
    .join("\n"))
  await writeConfig("nodenext", "NodeNext", "NodeNext", ["all.mts", "all.cts"])
  await writeConfig("bundler", "ESNext", "Bundler", ["all.mts"])

  const tsc = resolve(repo, "node_modules", ".bin", "tsc")
  await check(tsc, resolve(root, "tsconfig.nodenext.json"))
  await check(tsc, resolve(root, "tsconfig.bundler.json"))
  process.stdout.write(`${JSON.stringify({ packages: published.length, commonjs: commonjs.length })}\n`)
} finally {
  await rm(root, { recursive: true, force: true })
}

async function writeConfig(name, module, moduleResolution, include) {
  await writeFile(resolve(root, `tsconfig.${name}.json`), JSON.stringify({
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      module,
      moduleResolution,
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: "ES2022",
    },
    include,
  }))
}

function hasCondition(value, condition) {
  if (!value || typeof value !== "object") return false
  if (condition in value) return true
  return Object.values(value).some((entry) => hasCondition(entry, condition))
}

async function check(tsc, project) {
  try {
    await exec(tsc, ["--project", project], { cwd: root })
  } catch (error) {
    const diagnostics = String(error.stdout)
      .split("\n")
      .filter((line) => /(?:packages\/.*|all\.[mc]ts).*\(\d+,\d+\): error TS/.test(line))
    if (diagnostics.length === 0) return
    throw new Error(diagnostics.join("\n"))
  }
}
