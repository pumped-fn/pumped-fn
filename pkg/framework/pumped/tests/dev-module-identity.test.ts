import { fileURLToPath } from "node:url"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL("fixtures/verify-dev-boot.mjs", import.meta.url))
const packageRoot = fileURLToPath(new URL("..", import.meta.url))

describe("pumped dev module identity", () => {
  it("resolves a schedule tag attached by user code loaded through Vite's SSR module runner", async () => {
    const { stdout } = await execFileAsync(process.execPath, [scriptPath], { cwd: packageRoot })
    expect(stdout).toContain("OK")
  })
})
