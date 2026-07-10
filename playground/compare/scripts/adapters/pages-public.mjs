import { chromium } from "playwright"
import { auditComputedGrayscale, auditHorizontalOverflow } from "./color-audit.mjs"
import { loadBaseline, parseManifest, sha256 } from "../pages-lib.mjs"

const expectedLanes = ["pumped-fn", "effect", "awilix", "inversify", "plain"]
const expectedLaneLabels = ["pumped-fn", "Effect", "Awilix", "Inversify", "Plain TS"]
const expectedDimensions = ["Build", "Test", "Operate"]
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
const verifierTimeoutMs = Number(process.env.PAGES_VERIFY_TIMEOUT_MS ?? 360000)
if (!baseUrlSource) throw new Error("public Pages base URL argument or PAGES_PUBLIC_BASE_URL is required")
if (!expectedRevision) throw new Error("expected revision argument or PAGES_EXPECTED_REVISION is required")
if (!/^[a-f0-9]{40}$/.test(expectedRevision)) throw new Error("expected revision must be a full Git SHA")
if (!/^(clean|dirty)$/.test(expectedTreeState)) throw new Error("expected tree state must be clean or dirty")
if (!Number.isSafeInteger(verifierTimeoutMs) || verifierTimeoutMs < 30000) throw new Error("invalid Pages verifier timeout")

function phase(name, details = {}) {
  process.stdout.write(`${JSON.stringify({ pagesVerifyPhase: name, ...details })}\n`)
}

const watchdog = setTimeout(() => {
  process.stderr.write(`${JSON.stringify({ pagesVerifyPhase: "timeout", timeoutMs: verifierTimeoutMs })}\n`)
  process.exit(124)
}, verifierTimeoutMs)

const baseUrl = new URL(baseUrlSource)
if (!/^https?:$/.test(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
  throw new Error("public Pages base URL must be an HTTP URL without credentials, query, or fragment")
}
baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, "")}/`

const baseline = await loadBaseline()
const preservedEntries = baseline.entries.filter(({ path }) => path !== "index.html")
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
  const url = new URL("revision.json", baseUrl)
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
phase("revision-pinned", { sourceRevision: revision.sourceRevision })
if (revision.schemaVersion !== 2) throw new Error("revision metadata has the wrong schema version")
if (revision.repository !== "pumped-fn/pumped-fn") throw new Error("revision metadata has the wrong repository")
if (revision.basePath !== "/pumped-fn/") throw new Error("revision metadata has the wrong base path")
if (revision.sourceTreeState !== expectedTreeState) throw new Error("revision metadata has the wrong tree state")
if (revision.baselineManifestSha256 !== baseline.provenance.manifestSha256) throw new Error("wrong baseline manifest")
if (revision.baselinePathCount !== 109 || revision.preservedBaselinePathCount !== 108) throw new Error("wrong baseline counts")
if (JSON.stringify(revision.replacedBaselinePaths) !== JSON.stringify(["index.html"])) throw new Error("wrong replacement set")

const homepageManifest = `${revision.homepageAssets.map(({ path, digest }) => `${path} ${digest}`).join("\n")}\n`
const homepageAssets = parseManifest(homepageManifest)
if (revision.homepageAssetPathCount !== homepageAssets.length) throw new Error("wrong homepage asset count")
if (revision.homepageAssetManifestSha256 !== sha256(homepageManifest)) throw new Error("wrong homepage asset manifest")
if (revision.legacyRedirects.length !== 1) throw new Error("wrong redirect count")
const [redirect] = revision.legacyRedirects
if (redirect.path !== "compare/index.html" || redirect.target !== "/pumped-fn/") throw new Error("wrong redirect contract")

const expectedRollback = {
  archiveSha256: baseline.provenance.archiveSha256,
  manifestSha256: baseline.provenance.manifestSha256,
  rootSha256: baseline.provenance.rootSha256,
  pathCount: baseline.provenance.pathCount,
}
if (JSON.stringify(revision.rollback) !== JSON.stringify(expectedRollback)) throw new Error("wrong rollback provenance")

async function verifyFiles(entries, label) {
  let cursor = 0
  async function verifyNextFile() {
    while (cursor < entries.length) {
      const { path, digest } = entries[cursor++]
      const encodedPath = path.split("/").map(encodeURIComponent).join("/")
      const actualDigest = sha256(await fetchBytes(new URL(encodedPath, baseUrl)))
      if (actualDigest !== digest) throw new Error(`public ${label} digest mismatch: ${path}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, entries.length) }, verifyNextFile))
}

await Promise.all([
  verifyFiles(preservedEntries, "preserved baseline"),
  verifyFiles(homepageAssets, "homepage asset"),
  verifyFiles([{ path: redirect.path, digest: redirect.digest }], "legacy redirect"),
])
phase("asset-digests-verified", {
  preservedBaselinePathCount: preservedEntries.length,
  homepageAssetPathCount: homepageAssets.length,
})
const stagedContentEntries = [...preservedEntries, ...homepageAssets, { path: redirect.path, digest: redirect.digest }]
  .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
const stagedContentManifest = `${stagedContentEntries.map(({ path, digest }) => `${path} ${digest}`).join("\n")}\n`
if (revision.stagedContentPathCount !== stagedContentEntries.length) throw new Error("wrong staged content count")
if (revision.stagedContentManifestSha256 !== sha256(stagedContentManifest)) throw new Error("wrong staged content manifest")

function collectDiagnostics(page) {
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
  return diagnostics
}

async function verifySelectors(page) {
  const tabs = page.getByRole("button", { name: /^(Build|Test|Operate)$/ })
  if (await tabs.allTextContents().then((values) => values.join("\n")) !== expectedDimensions.join("\n")) {
    throw new Error("comparison dimension selectors are incomplete")
  }
  for (const dimension of expectedDimensions) {
    await page.getByRole("button", { name: dimension, exact: true }).click()
    for (const lane of expectedLaneLabels) {
      await page.getByRole("button", { name: lane, exact: true }).click()
      await page.getByRole("heading", { name: `${dimension}: ${lane}`, exact: true }).waitFor()
    }
  }
}

const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
    phase("viewport-start", viewport)
    const page = await browser.newPage({ viewport })
    page.setDefaultTimeout(10000)
    const diagnostics = collectDiagnostics(page)
    const homepageUrl = new URL(baseUrl)
    homepageUrl.searchParams.set("pumped-fn-revision", expectedRevision)
    await page.goto(homepageUrl.href, { waitUntil: "domcontentloaded", timeout: requestTimeoutMs })
    const preview = page.frameLocator('iframe[title="Sandpack Preview"]')
    try {
      await preview.locator('[data-comparison-ready="true"]').waitFor({ timeout: 90000 })
    } catch (error) {
      const previewBody = await preview.locator("body").innerText({ timeout: 5000 }).catch((bodyError) => `preview body unavailable: ${bodyError.message}`)
      throw new Error(`${error.message}\n${diagnostics.join("\n")}\n${previewBody}`)
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
      if (JSON.stringify(actual) !== JSON.stringify({ ...expectedOutcomes, events: expectedEvents })) {
        throw new Error(`${result.lane} did not complete the exact three-request lifecycle`)
      }
    }
    await verifySelectors(page)
    await auditComputedGrayscale(page)
    await auditHorizontalOverflow(page, viewport)
    if (diagnostics.length > 0) throw new Error(`public comparison emitted diagnostics\n${diagnostics.join("\n")}`)
    await page.close()
    phase("viewport-complete", viewport)
  }

  phase("redirect-start")
  const redirectPage = await browser.newPage()
  await redirectPage.goto(new URL("compare/", baseUrl).href, { waitUntil: "domcontentloaded", timeout: requestTimeoutMs })
  await redirectPage.waitForURL((url) => url.pathname === baseUrl.pathname, { timeout: requestTimeoutMs })
  await redirectPage.close()
  phase("redirect-complete")
} finally {
  await browser.close()
}

clearTimeout(watchdog)
process.stdout.write(`${JSON.stringify({
  status: "verified-public-root",
  baseUrl: baseUrl.href,
  sourceRevision: revision.sourceRevision,
  preservedBaselinePathCount: preservedEntries.length,
  homepageAssetPathCount: homepageAssets.length,
  comparisonLaneCount: expectedLanes.length,
  comparisonDimensionCount: expectedDimensions.length,
  viewportCount: 2,
  computedNonGrayscaleColorCount: 0,
  horizontalOverflowViewportCount: 0,
})}\n`)
