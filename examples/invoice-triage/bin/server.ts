import { serve } from "@hono/node-server"
import { createInvoiceScope, startWorkers, stopWorkers } from "../src/main"
import { createApp } from "../src/server"

const port = Number(process.env["PORT"] ?? 3000)
const scope = createInvoiceScope()
const workers = await startWorkers(scope)
const app = createApp({ scope })
const server = serve({ fetch: app.fetch, port })
let closing: Promise<void> | undefined

async function shutdown(): Promise<void> {
  closing ??= closeServer().then(async () => {
    try {
      await stopWorkers(workers)
    } finally {
      await scope.dispose()
    }
  })
  await closing
}

function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function onSignal(): void {
  void shutdown().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

process.once("SIGINT", onSignal)
process.once("SIGTERM", onSignal)
