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

  const { createScope, isAtom } = await ssrEnvironment.runner.import("@pumped-fn/lite")
  const { scheduler } = await ssrEnvironment.runner.import("@pumped-fn/lite-extension-scheduler")

  const manifest = await ssrEnvironment.runner.import("virtual:pumped/manifest")
  const entry = manifest.entries.find((candidate) => candidate.kind === "jobs")
  if (!entry) throw new Error("expected a jobs entry to be discovered")

  if (!isAtom(entry.schedule)) {
    throw new Error("jobs entry did not default-export a schedule() atom across the module runner boundary")
  }

  const scope = createScope({ tags: [scheduler.backend(scheduler.inProcess())] })
  const registration = await scope.resolve(entry.schedule)
  const next = registration.next()
  if (!(next instanceof Date)) {
    throw new Error(`schedule atom did not resolve a valid cron registration across the module runner boundary, got: ${JSON.stringify(next)}`)
  }
  await scope.dispose()

  process.stdout.write("OK\n")
  await server.close()
  process.exit(0)
} catch (error) {
  await server.close()
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
