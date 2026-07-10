import { chromium } from "playwright"
import { loadBaseline, parseManifest, sha256 } from "../pages-lib.mjs"

const expectedLanes = ["pumped-fn", "effect", "awilix", "inversify", "plain"]
const expectedEvents = [
  "database.acquire",
  "uuid.next",
  "clock.now",
  "database.transaction.begin",
  "database.users.insert",
  "database.transaction.commit",
  "uuid.next",
  "clock.now",
  "database.transaction.begin",
  "database.users.duplicate",
  "database.transaction.rollback",
  "uuid.next",
  "clock.now",
  "database.transaction.begin",
  "database.users.insert",
  "database.transaction.commit",
  "database.release",
]
const expectedOutcomes = {
  success: {
    ok: true,
    user: {
      id: "user-1",
      email: "ada@example.com",
      actorId: "admin-1",
      requestId: "request-1",
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  },
  duplicate: {
    ok: false,
    error: { kind: "duplicate-email", email: "ada@example.com" },
  },
  secondSuccess: {
    ok: true,
    user: {
      id: "user-3",
      email: "grace@example.com",
      actorId: "admin-3",
      requestId: "request-3",
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  },
}

const baseUrlSource = process.argv[2] ?? process.env.PAGES_PUBLIC_BASE_URL
const expectedRevision = process.argv[3] ?? process.env.PAGES_EXPECTED_REVISION
const expectedTreeState = process.env.PAGES_EXPECTED_TREE_STATE ?? "clean"
if (!baseUrlSource) throw new Error("public Pages base URL argument or PAGES_PUBLIC_BASE_URL is required")
if (!expectedRevision) throw new Error("expected revision argument or PAGES_EXPECTED_REVISION is required")
if (!/^[a-f0-9]{40}$/.test(expectedRevision)) throw new Error("expected revision must be a full Git SHA")
if (!/^(clean|dirty)$/.test(expectedTreeState)) throw new Error("expected tree state must be clean or dirty")

const baseUrl = new URL(baseUrlSource)
if (!/^https?:$/.test(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
  throw new Error("public Pages base URL must be an HTTP URL without credentials, query, or fragment")
}
baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, "")}/`

const baseline = await loadBaseline()
const requestTimeoutMs = 15000
const revisionDeadline = Date.now() + 120000

async function fetchBytes(url) {
  const requestUrl = new URL(url)
  requestUrl.searchParams.set("pumped-fn-revision", expectedRevision)
  const response = await fetch(requestUrl, {
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  if (!response.ok) throw new Error(`${response.status} ${requestUrl}`)
  return Buffer.from(await response.arrayBuffer())
}

async function loadRevision() {
  const url = new URL("compare/revision.json", baseUrl)
  let lastError
  while (Date.now() < revisionDeadline) {
    try {
      const revision = JSON.parse((await fetchBytes(url)).toString("utf8"))
      if (revision.sourceRevision === expectedRevision) return revision
      lastError = new Error(`expected revision ${expectedRevision}, received ${revision.sourceRevision}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw lastError
}

const revision = await loadRevision()
if (revision.schemaVersion !== 1) throw new Error("revision metadata has the wrong schema version")
if (revision.repository !== "pumped-fn/pumped-fn") throw new Error("revision metadata has the wrong repository")
if (revision.basePath !== "/pumped-fn/compare/") throw new Error("revision metadata has the wrong base path")
if (revision.sourceTreeState !== expectedTreeState) throw new Error("revision metadata has the wrong tree state")
if (revision.baselineManifestSha256 !== baseline.provenance.manifestSha256) {
  throw new Error("revision metadata has the wrong baseline manifest")
}
if (revision.baselinePathCount !== baseline.entries.length) throw new Error("revision metadata has the wrong baseline count")
if (!Array.isArray(revision.comparisonAssets)) throw new Error("revision metadata has no comparison assets")
const comparisonManifest = `${revision.comparisonAssets.map(({ path, digest }) => `${path} ${digest}`).join("\n")}\n`
const comparisonAssets = parseManifest(comparisonManifest)
if (revision.comparisonAssetPathCount !== comparisonAssets.length) {
  throw new Error("revision metadata has the wrong comparison asset count")
}
if (revision.comparisonAssetManifestSha256 !== sha256(comparisonManifest)) {
  throw new Error("revision metadata has the wrong comparison asset manifest")
}

async function verifyFiles(entries, prefix, label) {
  let cursor = 0
  async function verifyNextFile() {
    while (cursor < entries.length) {
      const { path, digest } = entries[cursor++]
      const encodedPath = path.split("/").map(encodeURIComponent).join("/")
      const actualDigest = sha256(await fetchBytes(new URL(`${prefix}${encodedPath}`, baseUrl)))
      if (actualDigest !== digest) throw new Error(`public ${label} digest mismatch: ${path}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, entries.length) }, verifyNextFile))
}
await Promise.all([
  verifyFiles(baseline.entries, "", "baseline"),
  verifyFiles(comparisonAssets, "compare/", "comparison asset"),
])

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const diagnostics = []
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(message.text())
  })
  page.on("pageerror", (error) => diagnostics.push(error.message))
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`)
  })
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "request failed"
    const hostname = new URL(request.url()).hostname
    if (failure === "net::ERR_ABORTED" && hostname.endsWith(".codesandbox.io")) return
    diagnostics.push(`${failure} ${request.url()}`)
  })
  const comparisonUrl = new URL("compare/", baseUrl)
  comparisonUrl.searchParams.set("pumped-fn-revision", expectedRevision)
  await page.goto(comparisonUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: requestTimeoutMs,
  })
  const preview = page.frameLocator('iframe[title="Sandpack Preview"]')
  try {
    await preview.locator('[data-comparison-ready="true"]').waitFor({ timeout: 120000 })
  } catch (error) {
    throw new Error(`${error.message}\n${diagnostics.join("\n")}\n${await preview.locator("body").innerText()}`)
  }
  const source = await preview.locator("#app").getAttribute("data-results")
  if (!source) throw new Error("comparison results are missing")
  const results = JSON.parse(source)
  if (results.map(({ lane }) => lane).join("\n") !== expectedLanes.join("\n")) {
    throw new Error("public comparison did not execute all five expected lanes in order")
  }
  for (const result of results) {
    const actual = {
      success: result.success,
      duplicate: result.duplicate,
      secondSuccess: result.secondSuccess,
      events: result.events,
    }
    const expected = { ...expectedOutcomes, events: expectedEvents }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${result.lane} did not complete the exact three-request lifecycle`)
    }
  }
  if (diagnostics.length > 0) throw new Error(`public comparison emitted diagnostics\n${diagnostics.join("\n")}`)
} finally {
  await browser.close()
}

process.stdout.write(`${JSON.stringify({
  status: "verified-public",
  baseUrl: baseUrl.href,
  sourceRevision: revision.sourceRevision,
  unchangedNonComparePathCount: baseline.entries.length,
  comparisonAssetPathCount: comparisonAssets.length,
  comparisonLaneCount: expectedLanes.length,
})}\n`)
