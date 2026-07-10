import { loadBaseline, sha256 } from "../pages-lib.mjs"

const baseUrlSource = process.argv[2] ?? process.env.PAGES_PUBLIC_BASE_URL
if (!baseUrlSource) throw new Error("public Pages base URL argument or PAGES_PUBLIC_BASE_URL is required")
const baseUrl = new URL(baseUrlSource)
if (!/^https?:$/.test(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
  throw new Error("public Pages base URL must be an HTTP URL without credentials, query, or fragment")
}
baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, "")}/`

const baseline = await loadBaseline()
const requestTimeoutMs = 15000
const deadline = Date.now() + 120000

async function fetchBytes(path) {
  const url = new URL(path, baseUrl)
  url.searchParams.set("pumped-fn-rollback", baseline.provenance.rootSha256)
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

let observedRoot
while (Date.now() < deadline) {
  observedRoot = sha256(await fetchBytes("index.html"))
  if (observedRoot === baseline.provenance.rootSha256) break
  await new Promise((resolve) => setTimeout(resolve, 2000))
}
if (observedRoot !== baseline.provenance.rootSha256) throw new Error("public rollback root did not reach baseline provenance")

let cursor = 0
async function verifyNextFile() {
  while (cursor < baseline.entries.length) {
    const { path, digest } = baseline.entries[cursor++]
    const encodedPath = path.split("/").map(encodeURIComponent).join("/")
    if (sha256(await fetchBytes(encodedPath)) !== digest) throw new Error(`public rollback digest mismatch: ${path}`)
  }
}
await Promise.all(Array.from({ length: 8 }, verifyNextFile))

process.stdout.write(`${JSON.stringify({
  status: "verified-public-baseline-rollback",
  baseUrl: baseUrl.href,
  baselinePathCount: baseline.entries.length,
  baselineManifestSha256: baseline.provenance.manifestSha256,
  baselineRootSha256: baseline.provenance.rootSha256,
})}\n`)
