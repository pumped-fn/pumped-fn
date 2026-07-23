import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel } from "@pumped-fn/lite-extension-observable-otel"
import { extension } from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"
import * as sandbox from "@pumped-fn/sdk/sandbox"
import * as session from "@pumped-fn/sdk/session"
import * as sdkValidation from "@pumped-fn/sdk/validation"
import * as pi from "@pumped-fn/sdk-pi"
import { config, loadEnvironment } from "../src/config.js"
import { githubBindings } from "../src/github.js"
import { policy as httpPolicy, requestBinding } from "../src/http.js"
import { postgresqlBinding } from "../src/postgresql.js"
import { processBinding } from "../src/process.js"
import { repositoryBinding } from "../src/repository.js"
import { sessionBindings } from "../src/session.js"
import {
  config as triageConfig,
  createZodSdkEngine,
  createZodValidationEngine,
  watchIssues,
} from "../src/triage.js"
import { victoriaBinding } from "../src/victoria.js"

const values = loadEnvironment(process.env)
const spans = otel.sink()
const scope = createScope({
  extensions: [extension(), logging.extension(), observable.extension()],
  tags: [
    config.clock(Date.now),
    config.github(values.github),
    config.plan(values.plan),
    config.victoria(values.victoria),
    config.model(values.model),
    config.controlDatabaseUrl(values.controlDatabaseUrl),
    config.targetDatabaseUrl(values.targetDatabaseUrl),
    triageConfig.clock(Date.now),
    triageConfig.watch({ concurrency: 2, continuous: true, idleWaitMs: values.github.pollIntervalMs }),
    triageConfig.validation(createZodValidationEngine()),
    triageConfig.capability({
      repositoryRoot: values.plan.repositoryRoot,
      databaseMode: "read-only",
      victoriaMaxWindowMs: values.plan.victoriaMaxWindowMs,
      publication: true,
      scopes: ["repository:read", "postgresql:read-only", "victoria:bounded-read", "issues:write"],
    }),
    httpPolicy({
      origins: [new URL(values.github.apiUrl).origin, new URL(values.victoria.url).origin],
      maxResponseBytes: values.plan.maxEvidenceBytes,
    }),
    requestBinding,
    sandbox.policy({
      roots: [values.plan.repositoryRoot],
      write: false,
      network: false,
      commands: ["git"],
      timeoutMs: values.plan.statementTimeoutMs,
      maxOutputBytes: values.plan.maxEvidenceBytes,
    }),
    processBinding,
    repositoryBinding,
    postgresqlBinding,
    victoriaBinding,
    ...githubBindings,
    ...sessionBindings,
    session.clock({ now: () => new Date().toISOString() }),
    session.execution.turn({ flow: agent.turn }),
    sdkValidation.engine(createZodSdkEngine()),
    pi.piConfig(values.model),
    pi.piAttemptBinding,
    logging.runtime({
      flow: "all",
      fields: { service: "issue-triage" },
      sinks: [{
        name: "stdout",
        write: (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
      }],
    }),
    observable.runtime({
      sinks: [spans],
      only: ["flow", "resource", "function"],
      input: false,
      output: false,
    }),
  ],
})
const ctx = scope.createContext()
let stopping = false
const stop = (signal: NodeJS.Signals) => {
  if (stopping) return
  stopping = true
  void ctx.close({ ok: false, error: new DOMException(`Received ${signal}`, "AbortError") })
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)

try {
  await ctx.exec({ flow: watchIssues })
} catch (error) {
  if (!stopping) throw error
} finally {
  process.removeListener("SIGINT", stop)
  process.removeListener("SIGTERM", stop)
  await ctx.close()
  await scope.dispose()
}
