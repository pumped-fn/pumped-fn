import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { discover, selectAppFile } from "../src/discover"

const fixtureDir = resolve(__dirname, "fixtures/basic/src")

describe("discover", () => {
  it("scans src/entries flat, ignoring nested support modules", () => {
    const { entries, appFile, apps } = discover(fixtureDir)

    expect(entries).toEqual([
      { name: "book-space", file: resolve(fixtureDir, "entries/book-space.ts") },
      { name: "greet", file: resolve(fixtureDir, "entries/greet.ts") },
      { name: "list-lots", file: resolve(fixtureDir, "entries/list-lots.ts") },
      { name: "nightly-sweep", file: resolve(fixtureDir, "entries/nightly-sweep.ts") },
      { name: "preview", file: resolve(fixtureDir, "entries/preview.ts") },
      { name: "report", file: resolve(fixtureDir, "entries/report.ts") },
    ])
    expect(appFile).toBe(resolve(fixtureDir, "app.ts"))
    expect(apps).toEqual([
      { name: "east", file: resolve(fixtureDir, "apps/east.ts") },
    ])
  })

  it("returns undefined appFile and no entries when nothing exists", () => {
    const result = discover(resolve(__dirname, "fixtures/empty"))
    expect(result).toEqual({ entries: [], appFile: undefined, apps: [] })
  })

  it("rejects a legacy layout loudly instead of discovering nothing", () => {
    const legacy = mkdtempSync(join(tmpdir(), "pumped-legacy-"))
    mkdirSync(join(legacy, "server"))
    mkdirSync(join(legacy, "jobs"))
    writeFileSync(join(legacy, "server/greet.ts"), "export default {}\n")

    expect(() => discover(legacy)).toThrow(
      "found legacy entry directories (src/server, src/jobs); pumped discovers only src/entries"
    )
  })

  it("rejects a partial migration instead of silently dropping legacy entries", () => {
    const partial = mkdtempSync(join(tmpdir(), "pumped-partial-"))
    mkdirSync(join(partial, "entries"))
    mkdirSync(join(partial, "server"))
    writeFileSync(join(partial, "entries/new-thing.ts"), "export default {}\n")
    writeFileSync(join(partial, "server/greet.ts"), "export default {}\n")

    expect(() => discover(partial)).toThrow("found legacy entry directories (src/server)")
  })

  it("selects the default or a named app", () => {
    const discovery = discover(fixtureDir)

    expect(selectAppFile(discovery)).toBe(resolve(fixtureDir, "app.ts"))
    expect(selectAppFile(discovery, "default")).toBe(resolve(fixtureDir, "app.ts"))
    expect(selectAppFile(discovery, "east")).toBe(resolve(fixtureDir, "apps/east.ts"))
  })

  it("reports the available apps when selection fails", () => {
    const discovery = discover(fixtureDir)

    expect(() => selectAppFile(discovery, "west")).toThrow(
      'app "west" was not found; available apps: default, east'
    )
    expect(() => selectAppFile({ entries: [], appFile: undefined, apps: [] }, "west")).toThrow(
      'app "west" was not found; no apps are available'
    )
  })

  it("rejects ambiguous and reserved named apps", () => {
    const ambiguous = mkdtempSync(join(tmpdir(), "pumped-apps-"))
    mkdirSync(join(ambiguous, "apps"))
    writeFileSync(join(ambiguous, "apps/east_us.ts"), "export default {}\n")
    writeFileSync(join(ambiguous, "apps/east-us.ts"), "export default {}\n")

    expect(() => discover(ambiguous)).toThrow('named app "east-us" is ambiguous')

    const reserved = mkdtempSync(join(tmpdir(), "pumped-apps-"))
    mkdirSync(join(reserved, "apps"))
    writeFileSync(join(reserved, "apps/default.ts"), "export default {}\n")

    expect(() => discover(reserved)).toThrow('named app "default" is reserved')
  })
})
