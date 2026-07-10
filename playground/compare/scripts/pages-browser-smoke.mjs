import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, sep } from "node:path"
import { chromium } from "playwright"
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
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const diagnostics = []
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.push(message.text())
    })
    page.on("response", (response) => {
      if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`)
    })
    page.on("requestfailed", (request) => {
      diagnostics.push(`${request.failure()?.errorText ?? "request failed"} ${request.url()}`)
    })
    await page.goto("http://127.0.0.1:4179/pumped-fn/compare/", { waitUntil: "domcontentloaded" })
    const preview = page.frameLocator('iframe[title="Sandpack Preview"]')
    try {
      await preview.locator('[data-comparison-ready="true"]').waitFor({ timeout: 120000 })
    } catch (error) {
      const output = await preview.locator("body").innerText()
      throw new Error(`${error.message}\n${diagnostics.join("\n")}\n${output}`)
    }
    const results = JSON.parse(await preview.locator("#app").getAttribute("data-results"))
    const expectedLanes = ["pumped-fn", "effect", "awilix", "inversify", "plain"]
    if (results.map(({ lane }) => lane).join("\n") !== expectedLanes.join("\n")) {
      throw new Error("the built Pages artifact did not execute all five expected lanes")
    }
    if (results.some(({ events }) => events.at(-1) !== "database.release")) {
      throw new Error("the built Pages artifact did not complete the shared lifecycle contract")
    }
    process.stdout.write("Pages artifact served at /pumped-fn/compare/ and executed all five comparison lanes\n")
  } finally {
    await browser.close()
  }
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
