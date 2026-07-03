import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { discover } from "../src/discover"

const fixtureDir = resolve(__dirname, "fixtures/basic/src")

describe("discover", () => {
  it("scans server, cli, and jobs entries flat, ignoring nested support modules", () => {
    const { entries, appFile } = discover(fixtureDir)

    expect(entries).toEqual(
      expect.arrayContaining([
        { kind: "server", name: "book-space", file: resolve(fixtureDir, "server/book-space.ts") },
        { kind: "server", name: "list-lots", file: resolve(fixtureDir, "server/list-lots.ts") },
        { kind: "cli", name: "report", file: resolve(fixtureDir, "cli/report.ts") },
        { kind: "jobs", name: "nightly-sweep", file: resolve(fixtureDir, "jobs/nightly-sweep.ts") },
      ])
    )
    expect(entries).toHaveLength(4)
    expect(appFile).toBe(resolve(fixtureDir, "app.ts"))
  })

  it("returns undefined appFile and no entries when nothing exists", () => {
    const result = discover(resolve(__dirname, "fixtures/empty"))
    expect(result).toEqual({ entries: [], appFile: undefined })
  })
})
