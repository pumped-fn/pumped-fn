import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { actor, auditReadiness, operation, type AuditInput, type AuditReport } from "../graph"
import type { CommandResult } from "./result"

export async function audit(input: AuditInput): Promise<CommandResult<AuditReport>> {
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
  const ctx = scope.createContext({ tags: [operation("audit")] })

  try {
    const output = await ctx.exec({ flow: auditReadiness, input })
    await ctx.close({ ok: true })
    return { output, logs: [...logs.records()], events: [...events.events()] }
  } catch (error) {
    await ctx.close({ ok: false, error })
    throw error
  } finally {
    await scope.dispose()
  }
}
