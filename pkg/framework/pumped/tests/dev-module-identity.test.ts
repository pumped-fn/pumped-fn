import { fileURLToPath } from "node:url"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL("fixtures/verify-dev-boot.mjs", import.meta.url))
const packageRoot = fileURLToPath(new URL("..", import.meta.url))

describe("pumped dev module identity", () => {
  it("serves a route entry declared by user code loaded through Vite's SSR module runner", { timeout: 60_000 }, async () => {
    const { stdout } = await execFileAsync(process.execPath, [scriptPath], { cwd: packageRoot })
    expect(stdout).toContain("OK")
  })
})
