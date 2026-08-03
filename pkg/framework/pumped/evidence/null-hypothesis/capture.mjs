import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build, version as viteVersion } from "vite"
import { flow as liteFlow } from "@pumped-fn/lite"
import { flow as metaFlow } from "@pumped-fn/pumped/app"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../../..")
process.chdir(root)
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
    const imports = [...new Set(chunks.flatMap((chunk) => [
      ...chunk.imports,
      ...chunk.dynamicImports,
    ]).map(normalize))].sort()
    const references = [...new Set(
      [...modules, ...imports].flatMap((reference) => (
        forbidden.filter((value) => reference.includes(value))
      ))
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
  return {
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
    cases: {
      lite: {
        status: lite.status,
        emittedBytes: lite.emittedBytes,
        moduleCount: lite.moduleCount,
        forbiddenReferences: lite.forbiddenReferences,
      },
      pumped: {
        status: meta.status,
        emittedBytes: meta.emittedBytes,
        moduleCount: meta.moduleCount,
        forbiddenReferences: meta.forbiddenReferences,
      },
    },
    comparison: {
      identityPreserved,
      extraBytes: meta.emittedBytes - lite.emittedBytes,
      metaGatePass,
      nullRejected: metaGatePass,
    },
  }
}

const evidence = await createEvidence()
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
if (!evidence.comparison.nullRejected) process.exitCode = 1
