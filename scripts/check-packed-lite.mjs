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
  { dir: "packages/lite", name: "@pumped-fn/lite", files: ["README.md", "PATTERNS.md", "MIGRATION.md", "LICENSE", "CHANGELOG.md"] },
  { dir: "packages/lite-react", name: "@pumped-fn/lite-react", files: ["README.md", "LICENSE", "CHANGELOG.md"] },
  { dir: "packages/lite-lint", name: "@pumped-fn/lite-lint", files: ["README.md", "LICENSE", "CHANGELOG.md", "bin/pumped-lite-lint.mjs", "dist/cli.mjs"] },
  { dir: "packages/lite-logging", name: "@pumped-fn/lite-logging", files: ["README.md", "LICENSE", "CHANGELOG.md"] },
  { dir: "packages/lite-logging-pino", name: "@pumped-fn/lite-logging-pino", files: ["README.md", "LICENSE", "CHANGELOG.md"] },
  { dir: "packages/lite-observability", name: "@pumped-fn/lite-observability", files: ["README.md", "LICENSE", "CHANGELOG.md"] },
  { dir: "packages/lite-observability-otel", name: "@pumped-fn/lite-observability-otel", files: ["README.md", "LICENSE", "CHANGELOG.md"] },
]

try {
  const packed = new Map()
  const liteVersion = JSON.parse(await readFile(resolve(repo, "packages/lite/package.json"))).version
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
  for (const name of ["react", "@types/react"]) await link(name, consumer, "packages/lite-react")
  await link("typescript-api", consumer, "packages/lite-lint")
  await link("pino", consumer, "packages/lite-logging-pino")
  await link("@opentelemetry/api", consumer, "packages/lite-observability-otel")

  await writeFile(join(consumer, "runtime.mjs"), [
    'import assert from "node:assert/strict"',
    'import { VERSION, atom, createScope, flow } from "@pumped-fn/lite"',
    'import { useAtom } from "@pumped-fn/lite-react"',
    'import { scanText } from "@pumped-fn/lite-lint"',
    'import { logging } from "@pumped-fn/lite-logging"',
    'import { pino } from "@pumped-fn/lite-logging-pino"',
    'import { observability } from "@pumped-fn/lite-observability"',
    'import { otel } from "@pumped-fn/lite-observability-otel"',
    'const value = atom({ factory: () => 1 })',
    'assert.equal(await createScope().resolve(value), 1)',
    `assert.equal(VERSION, ${JSON.stringify(liteVersion)})`,
    'assert.equal(typeof useAtom, "function")',
    'assert.equal(scanText("export const value = 1\\n", "src/value.ts").length, 0)',
    'const records = logging.memory()',
    'const events = observability.memory()',
    'const scope = createScope({',
    '  extensions: [logging.extension(), observability.extension()],',
    '  tags: [logging.runtime({ sinks: [records], flow: "all" }), observability.runtime({ sinks: [events] })],',
    '})',
    'await scope.ready',
    'const run = flow({ deps: { logger: logging.logger }, factory: (_ctx, { logger }) => { logger.info("packed"); return 2 } })',
    'assert.equal(await scope.run({ flow: run }), 2)',
    'assert(records.size() > 0)',
    'assert(events.size() > 0)',
    'await scope.dispose()',
    'const calls = []',
    'pino.sink({ debug: (...args) => calls.push(args), info: (...args) => calls.push(args), warn: (...args) => calls.push(args), error: (...args) => calls.push(args) }).write({ id: "log-1", at: 1, level: "info", message: "packed" })',
    'assert.equal(calls.length, 1)',
    'const spans = []',
    'const otelSink = otel.sink({ tracer: { startSpan: () => ({ setAttributes() { return this }, setStatus() { return this }, recordException() {}, end() { spans.push("end") } }) } })',
    'otelSink.emit({ id: "span-1", phase: "start", kind: "flow", name: "packed", at: 1 })',
    'otelSink.emit({ id: "span-1", phase: "success", kind: "flow", name: "packed", at: 2, startedAt: 1, durationMs: 1 })',
    'assert.deepEqual(spans, ["end"])',
  ].join("\n"))
  await writeFile(join(consumer, "runtime.cjs"), [
    'const assert = require("node:assert/strict")',
    'const { VERSION, atom, createScope, flow } = require("@pumped-fn/lite")',
    'const { useAtom } = require("@pumped-fn/lite-react")',
    'const { scanText } = require("@pumped-fn/lite-lint")',
    'const { logging } = require("@pumped-fn/lite-logging")',
    'const { pino } = require("@pumped-fn/lite-logging-pino")',
    'const { observability } = require("@pumped-fn/lite-observability")',
    'const { otel } = require("@pumped-fn/lite-observability-otel")',
    'const value = atom({ factory: () => 1 })',
    `assert.equal(VERSION, ${JSON.stringify(liteVersion)})`,
    'assert.equal(typeof useAtom, "function")',
    'assert.equal(scanText("export const value = 1\\n", "src/value.ts").length, 0)',
    'const main = async () => {',
    '  assert.equal(await createScope().resolve(value), 1)',
    '  const records = logging.memory()',
    '  const events = observability.memory()',
    '  const scope = createScope({',
    '    extensions: [logging.extension(), observability.extension()],',
    '    tags: [logging.runtime({ sinks: [records], flow: "all" }), observability.runtime({ sinks: [events] })],',
    '  })',
    '  await scope.ready',
    '  const run = flow({ deps: { logger: logging.logger }, factory: (_ctx, { logger }) => { logger.info("packed"); return 2 } })',
    '  assert.equal(await scope.run({ flow: run }), 2)',
    '  assert(records.size() > 0)',
    '  assert(events.size() > 0)',
    '  await scope.dispose()',
    '  const calls = []',
    '  pino.sink({ debug: (...args) => calls.push(args), info: (...args) => calls.push(args), warn: (...args) => calls.push(args), error: (...args) => calls.push(args) }).write({ id: "log-1", at: 1, level: "info", message: "packed" })',
    '  assert.equal(calls.length, 1)',
    '  const spans = []',
    '  const otelSink = otel.sink({ tracer: { startSpan: () => ({ setAttributes() { return this }, setStatus() { return this }, recordException() {}, end() { spans.push("end") } }) } })',
    '  otelSink.emit({ id: "span-1", phase: "start", kind: "flow", name: "packed", at: 1 })',
    '  otelSink.emit({ id: "span-1", phase: "success", kind: "flow", name: "packed", at: 2, startedAt: 1, durationMs: 1 })',
    '  assert.deepEqual(spans, ["end"])',
    '}',
    'main().catch((error) => { console.error(error); process.exitCode = 1 })',
  ].join("\n"))
  await exec(process.execPath, [join(consumer, "runtime.mjs")], { cwd: consumer })
  await exec(process.execPath, [join(consumer, "runtime.cjs")], { cwd: consumer })

  await writeFile(join(consumer, "lint-target.ts"), "export const value = 1\n")
  const lint = await exec(process.execPath, [
    join(consumer, "node_modules", "@pumped-fn", "lite-lint", "bin", "pumped-lite-lint.mjs"),
    "--json",
    "lint-target.ts",
  ], { cwd: consumer })
  const lintResult = JSON.parse(lint.stdout)
  assert.equal(lintResult.filesScanned, 1)
  assert.deepEqual(lintResult.diagnostics, [])

  await writeFile(join(consumer, "esm.ts"), [
    'import { atom, createScope } from "@pumped-fn/lite"',
    'import { useAtom } from "@pumped-fn/lite-react"',
    'import { scanText } from "@pumped-fn/lite-lint"',
    'import { logging } from "@pumped-fn/lite-logging"',
    'import { pino } from "@pumped-fn/lite-logging-pino"',
    'import { observability } from "@pumped-fn/lite-observability"',
    'import { otel } from "@pumped-fn/lite-observability-otel"',
    'const value = atom({ factory: () => 1 })',
    'const resolved: Promise<number> = createScope().resolve(value)',
    'const selected: number = useAtom(value)',
    'const diagnostics: number = scanText("export const value = 1", "src/value.ts").length',
    'const loggingExtension = logging.extension()',
    'const pinoSink = pino.sink',
    'const observabilityExtension = observability.extension()',
    'const otelSink = otel.sink()',
    'void resolved',
    'void selected',
    'void diagnostics',
    'void loggingExtension',
    'void pinoSink',
    'void observabilityExtension',
    'void otelSink',
  ].join("\n"))
  await writeFile(join(consumer, "cjs.cts"), [
    'import lite = require("@pumped-fn/lite")',
    'import react = require("@pumped-fn/lite-react")',
    'import lint = require("@pumped-fn/lite-lint")',
    'import loggingPackage = require("@pumped-fn/lite-logging")',
    'import pinoPackage = require("@pumped-fn/lite-logging-pino")',
    'import observabilityPackage = require("@pumped-fn/lite-observability")',
    'import otelPackage = require("@pumped-fn/lite-observability-otel")',
    'const value = lite.atom({ factory: () => 1 })',
    'const resolved: Promise<number> = lite.createScope().resolve(value)',
    'const selected: number = react.useAtom(value)',
    'const diagnostics: number = lint.scanText("export const value = 1", "src/value.ts").length',
    'const loggingExtension = loggingPackage.logging.extension()',
    'const pinoSink = pinoPackage.pino.sink',
    'const observabilityExtension = observabilityPackage.observability.extension()',
    'const otelSink = otelPackage.otel.sink()',
    'void resolved',
    'void selected',
    'void diagnostics',
    'void loggingExtension',
    'void pinoSink',
    'void observabilityExtension',
    'void otelSink',
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

async function link(name, consumer, packageDirectory) {
  const destination = join(consumer, "node_modules", ...name.split("/"))
  await mkdir(dirname(destination), { recursive: true })
  await symlink(await realpath(resolve(repo, packageDirectory, "node_modules", name)), destination, "dir")
}
