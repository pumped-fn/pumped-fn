import { model as provider } from "@pumped-fn/sdk"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { runCli } from "../src/invoice-cli"
import { createInvoiceServer } from "../src/invoice-server"
import { importInvoiceDirectory } from "../src/invoice-watcher"
import {
  clock,
  databaseEngine,
  mailer,
} from "../src/invoice-runtime"
import { memoryDatabase } from "./support/invoice-database"
import { memoryMailer } from "./support/invoice-mailer"
import { heuristic } from "./support/invoice-model"
import type { Invoice } from "../src/invoice-types"

const now = new Date("2026-07-05T12:00:00.000Z")

function invoice(id: string, options: Partial<Invoice> = {}): Invoice {
  return {
    id,
    vendor: "Acme SaaS",
    amount: 240,
    dueDate: "2026-07-08",
    description: "team subscription license",
    ...options,
  }
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "invoice-triage-"))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe("invoice triage operational edges", () => {
  it("server: imports invoices, exposes stored invoices, and exposes audit", async () => {
    const messages = memoryMailer()
    const { app, scope } = createInvoiceServer({
      tags: [
        provider(heuristic),
        databaseEngine(memoryDatabase()),
        mailer(messages),
        clock({ now: () => now }),
      ],
    })

    const imported = await app.request("/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoices: [invoice("inv-rest-1")] }),
    })
    const stored = await app.request("/invoices")
    const audit = await app.request("/audit")

    expect(imported.status).toBe(200)
    expect(await imported.json()).toEqual({ imported: 1, review: [] })
    expect((await stored.json()).map((item: { id: string }) => item.id)).toEqual(["inv-rest-1"])
    expect((await audit.json()).map((item: { action: string }) => item.action)).toEqual(["invoice.saved"])
    await scope.dispose()
  })

  it("cli: imports NDJSON files through the tagged intake seam", async () => {
    await withTempDir(async (dir) => {
      const file = join(dir, "batch.ndjson")
      await writeFile(file, [
        JSON.stringify(invoice("inv-cli-1")),
        "not json",
        JSON.stringify(invoice("inv-cli-2")),
      ].join("\n"))
      const output: string[] = []
      const code = await runCli(["import", file], {
        out: (line) => output.push(line),
        err: (line) => output.push(line),
      }, {
        tags: [
          databaseEngine(memoryDatabase()),
          clock({ now: () => now }),
        ],
      })

      expect(code).toBe(0)
      expect(output.map((line) => JSON.parse(line))).toEqual([{ accepted: 2, rejected: 1 }])
    })
  })

  it("watcher: imports every existing file in a watched directory before waiting", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "first.ndjson"), JSON.stringify(invoice("inv-watch-1")))
      await writeFile(join(dir, "second.ndjson"), [
        JSON.stringify(invoice("inv-watch-2")),
        "not json",
      ].join("\n"))

      const summary = await importInvoiceDirectory(dir, {
        tags: [
          databaseEngine(memoryDatabase()),
          clock({ now: () => now }),
        ],
      })

      expect(summary).toEqual({ accepted: 2, rejected: 1 })
    })
  })
})
