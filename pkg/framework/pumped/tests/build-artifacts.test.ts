import { execFile } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const fixtureRoot = fileURLToPath(new URL("fixtures/basic", import.meta.url))
const bin = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url))

let serverArtifact: string
let cliArtifact: string

describe("built artifacts carry only what their tags demand", () => {
  beforeAll(async () => {
    await execFileAsync(process.execPath, [bin, "build", "--target", "all"], { cwd: fixtureRoot })
    serverArtifact = readFileSync(resolve(fixtureRoot, "dist/server.mjs"), "utf8")
    cliArtifact = readFileSync(resolve(fixtureRoot, "dist/cli.mjs"), "utf8")
  }, 180_000)

  afterAll(() => {
    rmSync(resolve(fixtureRoot, "dist"), { recursive: true, force: true })
  })

  it("keeps hono and the http host out of the CLI artifact", () => {
    expect(cliArtifact).not.toContain("hono")
    expect(cliArtifact).not.toContain("httpHost")
  })

  it("keeps croner out of both artifacts; the scheduler stays an external dynamic import", () => {
    expect(serverArtifact).not.toContain("croner")
    expect(cliArtifact).not.toContain("@pumped-fn/lite-extension-scheduler")
    expect(serverArtifact).toContain('import("@pumped-fn/lite-extension-scheduler")')
  })

  it("keeps the vite toolchain out of both artifacts", () => {
    for (const artifact of [serverArtifact, cliArtifact]) {
      expect(artifact).not.toMatch(/from\s*["']vite["']/)
      expect(artifact).not.toContain("rolldown")
    }
  })

  it("drops an entry whose when rule the app does not satisfy from every artifact", () => {
    expect(serverArtifact).not.toContain("preview-capability-flow")
    expect(cliArtifact).not.toContain("preview-capability-flow")
  })

  it("puts a dual-tagged entry into both artifacts and single-host entries into one", () => {
    expect(serverArtifact).toContain("dual-host-greeting")
    expect(cliArtifact).toContain("dual-host-greeting")
    expect(serverArtifact).toContain("book-space")
    expect(cliArtifact).not.toContain("book-space")
    expect(cliArtifact).toContain("report")
    expect(serverArtifact).not.toContain('name: "report"')
  })

  it("runs the CLI artifact end to end", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [resolve(fixtureRoot, "dist/cli.mjs"), "greet", "--json", JSON.stringify({ name: "Ada" })],
      { cwd: fixtureRoot }
    )

    expect(JSON.parse(stdout)).toEqual({ message: "Hello, Ada from dual-host-greeting" })
  })
})
