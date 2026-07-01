import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { actor, deploymentPlan, operation, type DeployInput, type DeployPlan } from "../graph"
import type { CommandResult } from "./result"

export async function deploy(input: DeployInput): Promise<CommandResult<DeployPlan>> {
  const logs = logging.memory()
  const events = observable.memory()
  const scope = createScope({
    extensions: [logging.extension(), observable.extension()],
    tags: [
      actor(input.actor ?? "local"),
      logging.runtime({
        sinks: [logs],
        level: "info",
        flow: "all",
        fields: { surface: "cli", library: "shared-command" },
      }),
      observable.runtime({
        sinks: [events],
        only: ["flow", "resource"],
      }),
    ],
  })
  const ctx = scope.createContext({ tags: [operation("deploy")] })

  try {
    const output = await ctx.exec({ flow: deploymentPlan, input })
    await ctx.close({ ok: true })
    return { output, logs: [...logs.records()], events: [...events.events()] }
  } catch (error) {
    await ctx.close({ ok: false, error })
    throw error
  } finally {
    await scope.dispose()
  }
}
