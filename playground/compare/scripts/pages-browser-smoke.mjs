import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, sep } from "node:path"
import { stageRoot } from "./pages-lib.mjs"

const types = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
])

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (!url.pathname.startsWith("/pumped-fn/")) {
      response.writeHead(404).end()
      return
    }
    const requestPath = decodeURIComponent(url.pathname.slice("/pumped-fn/".length))
    const relativePath = requestPath.endsWith("/") ? `${requestPath}index.html` : requestPath
    const safePath = normalize(relativePath).split(sep).join("/")
    if (safePath.startsWith("../") || safePath === "..") {
      response.writeHead(400).end()
      return
    }
    const path = join(stageRoot, safePath)
    const info = await stat(path)
    if (!info.isFile()) throw new Error("not a file")
    response.writeHead(200, { "content-type": types.get(extname(path)) ?? "application/octet-stream" })
    createReadStream(path).pipe(response)
  } catch {
    response.writeHead(404).end()
  }
})

await new Promise((resolve) => server.listen(4179, "127.0.0.1", resolve))

try {
  const revision = JSON.parse(await readFile(join(stageRoot, "compare", "revision.json"), "utf8"))
  process.env.PAGES_PUBLIC_BASE_URL = "http://127.0.0.1:4179/pumped-fn/"
  process.env.PAGES_EXPECTED_REVISION = revision.sourceRevision
  process.env.PAGES_EXPECTED_TREE_STATE = revision.sourceTreeState
  await import("./adapters/pages-public.mjs")
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
