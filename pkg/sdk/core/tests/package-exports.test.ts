import { execFile } from "node:child_process"
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterAll, beforeAll, expect, it } from "vitest"

const exec = promisify(execFile)
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const entries = [
  "@pumped-fn/sdk",
  "@pumped-fn/sdk/agent",
  "@pumped-fn/sdk/session",
  "@pumped-fn/sdk/validation",
  "@pumped-fn/sdk/sandbox",
] as const
let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "pumped-sdk-package-"))
  const packed = JSON.parse((await exec("npm", ["pack", "--json", "--pack-destination", root], {
    cwd: packageRoot,
  })).stdout) as readonly { filename: string }[]
  const installed = join(root, "node_modules", "@pumped-fn", "sdk")
  await mkdir(installed, { recursive: true })
  await exec("tar", ["-xzf", join(root, packed[0]!.filename), "-C", installed, "--strip-components=1"])
  await linkDependency("@pumped-fn/lite")
  await linkDependency("@pumped-fn/lite-extension-suspense")
  await linkDependency("@standard-schema/spec")
}, 60_000)

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

it("loads every packed entry through import and require", async () => {
  const esm = join(root, "entries.mjs")
  const cjs = join(root, "entries.cjs")
  const imports = entries.map((entry, index) => `const entry${index} = await import(${JSON.stringify(entry)})`)
  const importedCounts = entries.map((_, index) => `Object.keys(entry${index}).length`)
  const requiredCounts = entries.map((entry) => `Object.keys(require(${JSON.stringify(entry)})).length`)
  await writeFile(esm, `${imports.join("\n")}\nconsole.log(JSON.stringify([${importedCounts.join(",")}]))\n`)
  await writeFile(cjs, `console.log(JSON.stringify([${requiredCounts.join(",")}]))\n`)

  const esmCounts = JSON.parse((await exec(process.execPath, [esm], { cwd: root })).stdout) as readonly number[]
  const cjsCounts = JSON.parse((await exec(process.execPath, [cjs], { cwd: root })).stdout) as readonly number[]
  expect(esmCounts).toHaveLength(entries.length)
  expect(cjsCounts).toHaveLength(entries.length)
  expect(esmCounts.every((count) => count > 0)).toBe(true)
  expect(cjsCounts.every((count) => count > 0)).toBe(true)
})

it("keeps agent, session, validation, and sandbox APIs off the root entry", async () => {
  const esm = join(root, "root-exports.mjs")
  const cjs = join(root, "root-exports.cjs")
  await writeFile(esm, `console.log(JSON.stringify(Object.keys(await import("@pumped-fn/sdk"))))\n`)
  await writeFile(cjs, `console.log(JSON.stringify(Object.keys(require("@pumped-fn/sdk"))))\n`)

  const esmExports = JSON.parse((await exec(process.execPath, [esm], { cwd: root })).stdout) as readonly string[]
  const cjsExports = JSON.parse((await exec(process.execPath, [cjs], { cwd: root })).stdout) as readonly string[]
  const subpathOnly = [
    "attempt",
    "invoke",
    "role",
    "skill",
    "subagent",
    "tool",
    "turn",
    "authority",
    "createAuthority",
    "finish",
    "narrowAuthority",
    "record",
    "engine",
    "standard",
    "impl",
    "policy",
    "read",
    "write",
    "exec",
  ]
  for (const name of subpathOnly) {
    expect(esmExports).not.toContain(name)
    expect(cjsExports).not.toContain(name)
  }
})

it("resolves packed ESM and CJS declarations under strict NodeNext", async () => {
  const fixture = join(root, "types")
  await mkdir(fixture)
  await writeFile(join(fixture, "package.json"), JSON.stringify({ type: "module" }))
  const esmTypes = entries.map(
    (entry, index) => `import * as entry${index} from ${JSON.stringify(entry)}\nvoid entry${index}`,
  )
  const cjsTypes = entries.map(
    (entry, index) => `import entry${index} = require(${JSON.stringify(entry)})\nvoid entry${index}`,
  )
  await writeFile(join(fixture, "entries.ts"), esmTypes.join("\n"))
  await writeFile(join(fixture, "entries.cts"), cjsTypes.join("\n"))
  await writeFile(join(fixture, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: "ES2022",
    },
    include: ["entries.ts", "entries.cts"],
  }))

  await expect(exec("pnpm", ["exec", "tsc", "--project", join(fixture, "tsconfig.json")], {
    cwd: packageRoot,
  })).resolves.toBeDefined()
})

it("rejects canonical subpath-only types from the packed root declaration", async () => {
  const fixture = join(root, "root-type-boundary")
  await mkdir(fixture)
  await writeFile(join(fixture, "package.json"), JSON.stringify({ type: "module" }))
  await writeFile(join(fixture, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: "ES2022",
    },
    include: ["probe.ts"],
  }))

  for (const name of ["ResolvedTool", "SessionRecord", "Engine", "Policy"]) {
    await writeFile(join(fixture, "probe.ts"), [
      `import type { ${name} } from "@pumped-fn/sdk"`,
      `export type Probe = ${name}`,
    ].join("\n"))
    await expect(exec("pnpm", ["exec", "tsc", "--project", join(fixture, "tsconfig.json")], {
      cwd: packageRoot,
    })).rejects.toMatchObject({ code: 2 })
  }
}, 30_000)

async function linkDependency(name: string): Promise<void> {
  const target = await realpath(join(packageRoot, "node_modules", name))
  const destination = join(root, "node_modules", name)
  await mkdir(dirname(destination), { recursive: true })
  await symlink(target, destination, "dir")
}
