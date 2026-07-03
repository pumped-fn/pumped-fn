import { resolve } from "node:path"
import { createServer, isRunnableDevEnvironment } from "vite"
import { pumped } from "@pumped-fn/pumped"

const root = resolve(import.meta.dirname, "schedule-dev")
const server = await createServer({
  configFile: false,
  root,
  logLevel: "silent",
  plugins: [pumped.plugin()],
})

try {
  const ssrEnvironment = server.environments.ssr
  if (!isRunnableDevEnvironment(ssrEnvironment)) throw new Error("ssr environment is not runnable")

  const manifest = await ssrEnvironment.runner.import("virtual:pumped/manifest")
  const entry = manifest.entries.find((candidate) => candidate.kind === "jobs")
  if (!entry) throw new Error("expected a jobs entry to be discovered")

  const meta = pumped.schedule.find(entry.flow)
  if (!meta || meta.cron !== "*/5 * * * *") {
    throw new Error(`schedule tag not found across the module runner boundary, got: ${JSON.stringify(meta)}`)
  }

  process.stdout.write("OK\n")
  await server.close()
  process.exit(0)
} catch (error) {
  await server.close()
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
