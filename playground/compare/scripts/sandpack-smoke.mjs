import { chromium } from "playwright"
import { createServer } from "vite"

const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: 4178,
    strictPort: true,
  },
})
await server.listen()

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
    const networkError = new Promise((_, reject) => {
      page.on("response", (response) => {
        if (response.status() >= 400 && response.url().includes("jsdelivr")) {
          reject(new Error(`${response.status()} ${response.url()}`))
        }
      })
    })
    const runtimeError = new Promise((_, reject) => {
      page.on("pageerror", (error) => {
        diagnostics.push(error.message)
        reject(error)
      })
    })
    await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" })
    const preview = page.frameLocator('iframe[title="Sandpack Preview"]')
    try {
      await Promise.race([
        preview.locator('[data-comparison-ready="true"]').waitFor({ timeout: 120000 }),
        runtimeError,
        networkError,
      ])
    } catch (error) {
      const output = await preview.locator("body").innerText()
      throw new Error(`${error.message}\n${diagnostics.join("\n")}\n${output}`)
    }
    const results = JSON.parse(await preview.locator("#app").getAttribute("data-results"))
    if (results.length !== 5) throw new Error(`expected 5 comparison lanes, received ${results.length}`)
    if (results.some((result) => result.events.at(-1) !== "database.release")) {
      throw new Error("comparison lanes did not complete the shared lifecycle contract")
    }
    process.stdout.write("Sandpack executed all five comparison lanes\n")
  } finally {
    await browser.close()
  }
} finally {
  await server.close()
}
