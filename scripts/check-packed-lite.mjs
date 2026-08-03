import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)
const repo = resolve(import.meta.dirname, "..")
const root = await mkdtemp(join(tmpdir(), "pumped-lite-pack-"))
const packages = [
  { dir: "pkg/core/lite", name: "@pumped-fn/lite", files: ["README.md", "PATTERNS.md", "MIGRATION.md", "LICENSE", "CHANGELOG.md"] },
  { dir: "pkg/react/lite-react", name: "@pumped-fn/lite-react", files: ["README.md", "LICENSE", "CHANGELOG.md"] },
]

try {
  const packed = new Map()
  const liteVersion = JSON.parse(await readFile(resolve(repo, "pkg/core/lite/package.json"))).version
  for (const pkg of packages) {
    const result = JSON.parse((await exec("npm", ["pack", "--json", "--pack-destination", root], {
      cwd: resolve(repo, pkg.dir),
    })).stdout)[0]
    const names = new Set(result.files.map(({ path }) => path))
    for (const file of pkg.files) assert(names.has(file), `${pkg.name} omits ${file}`)
    packed.set(pkg.name, join(root, result.filename))
  }

  const consumer = join(root, "consumer")
  await mkdir(consumer)
  await writeFile(join(consumer, "package.json"), JSON.stringify({ type: "module" }))
  for (const pkg of packages) {
    const destination = join(consumer, "node_modules", ...pkg.name.split("/"))
    await mkdir(destination, { recursive: true })
    await exec("tar", ["-xzf", packed.get(pkg.name), "-C", destination, "--strip-components=1"])
  }
  for (const name of ["react", "@types/react"]) await link(name, consumer)

  await writeFile(join(consumer, "runtime.mjs"), [
    'import assert from "node:assert/strict"',
    'import { VERSION, atom, createScope } from "@pumped-fn/lite"',
    'import { useAtom } from "@pumped-fn/lite-react"',
    'const value = atom({ factory: () => 1 })',
    'assert.equal(await createScope().resolve(value), 1)',
    `assert.equal(VERSION, ${JSON.stringify(liteVersion)})`,
    'assert.equal(typeof useAtom, "function")',
  ].join("\n"))
  await writeFile(join(consumer, "runtime.cjs"), [
    'const assert = require("node:assert/strict")',
    'const { VERSION, atom, createScope } = require("@pumped-fn/lite")',
    'const { useAtom } = require("@pumped-fn/lite-react")',
    'const value = atom({ factory: () => 1 })',
    'createScope().resolve(value).then((result) => assert.equal(result, 1))',
    `assert.equal(VERSION, ${JSON.stringify(liteVersion)})`,
    'assert.equal(typeof useAtom, "function")',
  ].join("\n"))
  await exec(process.execPath, [join(consumer, "runtime.mjs")], { cwd: consumer })
  await exec(process.execPath, [join(consumer, "runtime.cjs")], { cwd: consumer })

  await writeFile(join(consumer, "esm.ts"), [
    'import { atom, createScope } from "@pumped-fn/lite"',
    'import { useAtom } from "@pumped-fn/lite-react"',
    'const value = atom({ factory: () => 1 })',
    'const resolved: Promise<number> = createScope().resolve(value)',
    'const selected: number = useAtom(value)',
    'void resolved',
    'void selected',
  ].join("\n"))
  await writeFile(join(consumer, "cjs.cts"), [
    'import lite = require("@pumped-fn/lite")',
    'import react = require("@pumped-fn/lite-react")',
    'const value = lite.atom({ factory: () => 1 })',
    'const resolved: Promise<number> = lite.createScope().resolve(value)',
    'const selected: number = react.useAtom(value)',
    'void resolved',
    'void selected',
  ].join("\n"))
  await writeFile(join(consumer, "tsconfig.nodenext.json"), JSON.stringify({
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: "ES2022",
    },
    include: ["esm.ts", "cjs.cts"],
  }))
  await writeFile(join(consumer, "tsconfig.bundler.json"), JSON.stringify({
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      module: "ESNext",
      moduleResolution: "Bundler",
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: "ES2022",
    },
    include: ["esm.ts"],
  }))
  const tsc = resolve(repo, "node_modules", ".bin", "tsc")
  await exec(tsc, ["--project", join(consumer, "tsconfig.nodenext.json")], { cwd: consumer })
  await exec(tsc, ["--project", join(consumer, "tsconfig.bundler.json")], { cwd: consumer })

  const sizes = Object.fromEntries(await Promise.all([...packed].map(async ([name, path]) => [name, (await stat(path)).size])))
  process.stdout.write(`${JSON.stringify({ compiler: JSON.parse(await readFile(resolve(repo, "node_modules/typescript/package.json"))).version, sizes })}\n`)
} finally {
  await rm(root, { recursive: true, force: true })
}

async function link(name, consumer) {
  const destination = join(consumer, "node_modules", ...name.split("/"))
  await mkdir(dirname(destination), { recursive: true })
  await symlink(await realpath(resolve(repo, "pkg/react/lite-react/node_modules", name)), destination, "dir")
}
