import { execFile } from "node:child_process"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, describe, expect, it, vi } from "vitest"
import { main } from "../src/cli.js"

const roots: string[] = []
const exec = promisify(execFile)

afterEach(async () => {
  process.exitCode = undefined
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("lint CLI", () => {
  it("passes compositionPaths from the JSON config to the scanner", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumped-lite-lint-"))
    roots.push(root)
    await writeFile(join(root, "probe-gateway.ts"), `
      import { flow } from "@pumped-fn/lite"
      export const probe = flow({ factory: async () => fetch("https://example.test") })
    `)
    await writeFile(join(root, "lint.json"), JSON.stringify({
      compositionPaths: ["(?:^|/)probe-gateway\\.ts$"],
    }))
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)

    await main(["--config", "lint.json", "probe-gateway.ts"], root)

    expect(process.exitCode).toBeUndefined()
    expect(log).toHaveBeenCalledWith("pumped-lite-lint: 1 files scanned, 0 diagnostics")
  })

  it("runs through a symlinked package bin", async () => {
    const root = await mkdtemp(join(tmpdir(), "pumped-lite-lint-bin-"))
    roots.push(root)
    const bin = join(root, "pumped-lite-lint")
    await symlink(fileURLToPath(new URL("../dist/cli.mjs", import.meta.url)), bin)

    const { stdout } = await exec(process.execPath, [bin, "--help"])

    expect(stdout).toContain("Usage: pumped-lite-lint")
  })
})
