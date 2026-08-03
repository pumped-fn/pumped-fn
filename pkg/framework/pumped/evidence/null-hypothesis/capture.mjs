import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build, version as viteVersion } from "vite"
import { flow as liteFlow } from "@pumped-fn/lite"
import { flow as metaFlow } from "@pumped-fn/pumped/app"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../../..")
process.chdir(root)
const evidenceFile = resolve(here, "authoring-import-v3.json")
const liteFixture = resolve(here, "fixture/lite.mjs")
const metaFixture = resolve(here, "fixture/meta.mjs")
const maxExtraBytes = 256
const forbidden = [
  "@hono/node-server",
  "cac",
  "hono",
  "node:fs",
  "node:path",
  "vite",
  "pkg/framework/pumped/dist/app-scope-",
  "pkg/framework/pumped/dist/jobs-",
  "pkg/framework/pumped/dist/plugin-",
  "pkg/framework/pumped/dist/serve-",
  "pkg/framework/pumped/dist/workflows-",
]

function normalize(value) {
  const clean = value.replaceAll("\\", "/").replace(/^\0/, "<virtual>:")
  return clean.startsWith(root.replaceAll("\\", "/"))
    ? `<repo>/${relative(root, clean).replaceAll("\\", "/")}`
    : clean
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function capture(name) {
  try {
    const result = await build({
      configFile: false,
      logLevel: "silent",
      root,
      build: {
        lib: {
          entry: name === "lite" ? liteFixture : metaFixture,
          formats: ["es"],
          fileName: "index",
        },
        minify: false,
        target: "es2022",
        write: false,
      },
    })
    const outputs = (Array.isArray(result) ? result : [result])
      .flatMap((item) => item.output)
    const chunks = outputs.filter((item) => item.type === "chunk")
    const assets = outputs.filter((item) => item.type === "asset")
    const modules = [...new Set(chunks.flatMap((chunk) => Object.keys(chunk.modules).map(normalize)))].sort()
    const references = [...new Set(
      modules.flatMap((module) => forbidden.filter((value) => module.includes(value)))
    )].sort()

    return {
      status: "built",
      emittedBytes: chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk.code), 0)
        + assets.reduce((total, asset) => total + Buffer.byteLength(String(asset.source)), 0),
      moduleCount: modules.length,
      modules,
      forbiddenReferences: references,
    }
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      emittedBytes: 0,
      moduleCount: 0,
      modules: [],
      forbiddenReferences: [],
    }
  }
}

async function createEvidence() {
  const lite = await capture("lite")
  const meta = await capture("meta")
  const identityPreserved = liteFlow === metaFlow
  const metaGatePass = meta.status === "built"
    && meta.forbiddenReferences.length === 0
    && identityPreserved
    && meta.emittedBytes <= lite.emittedBytes + maxExtraBytes
  const evidence = {
    schemaVersion: 1,
    nullHypothesis: "The one-package authoring import is worse than importing Lite directly.",
    frozenGate: {
      maxExtraBytes,
      maxForbiddenReferences: 0,
      requiresExactHandleIdentity: true,
      requiresBrowserBuild: true,
    },
    environment: {
      node: process.version,
      vite: viteVersion,
    },
    inputs: {
      liteFixture: hash(readFileSync(liteFixture)),
      metaFixture: hash(readFileSync(metaFixture)),
      litePackage: hash(readFileSync(resolve(root, "pkg/core/lite/dist/index.mjs"))),
      metaPackage: hash(readFileSync(resolve(root, "pkg/framework/pumped/dist/app.mjs"))),
    },
    cases: { lite, meta },
    comparison: {
      identityPreserved,
      extraBytes: meta.emittedBytes - lite.emittedBytes,
      metaGatePass,
      nullRejected: metaGatePass,
    },
  }
  const serialized = JSON.stringify(evidence)
  return {
    ...evidence,
    selfHash: hash(serialized),
  }
}

const evidence = await createEvidence()
const output = `${JSON.stringify(evidence, null, 2)}\n`

if (process.argv.includes("--write")) {
  writeFileSync(evidenceFile, output)
  process.stdout.write(output)
} else {
  const existing = readFileSync(evidenceFile, "utf8")
  if (existing !== output) {
    const expectedLines = existing.split("\n")
    const actualLines = output.split("\n")
    const index = expectedLines.findIndex((line, lineIndex) => line !== actualLines[lineIndex])
    process.stderr.write(`authoring import evidence changed at line ${index + 1}\n`)
    process.stderr.write(`stored: ${expectedLines[index]}\n`)
    process.stderr.write(`actual: ${actualLines[index]}\n`)
    process.stderr.write("run capture.mjs --write and review the result\n")
    process.exitCode = 1
  } else {
    process.stdout.write(`authoring import evidence matches ${evidence.selfHash}\n`)
  }
}
