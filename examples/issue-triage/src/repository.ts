import { controller, flow, tags, typed } from "@pumped-fn/lite"
import * as sandbox from "@pumped-fn/sdk/sandbox"
import { config } from "./config.js"
import { containedRepositoryPath, digest, ports, TriageError, type Evidence, type RepositoryRead } from "./triage.js"
import { process } from "./process.js"

export const repository = {
  head: flow({
    name: "issue-triage.repository.head",
    deps: {
      plan: tags.required(config.plan),
      run: controller(process),
    },
    factory: async (_ctx, { plan, run }): Promise<string> => {
      const result = await run.exec({
        input: { command: "git", args: ["-C", plan.repositoryRoot, "rev-parse", "--verify", "HEAD^{commit}"] },
      })
      if (result.exitCode !== 0) throw new TriageError("evidence", plan.repositoryRoot, result.stderr.trim() || "Cannot resolve repository HEAD")
      return result.stdout.trim()
    },
  }),
  read: flow({
    name: "issue-triage.repository.read",
    parse: typed<RepositoryRead>(),
    deps: {
      plan: tags.required(config.plan),
      clock: tags.required(config.clock),
      run: controller(sandbox.exec),
    },
    factory: async (ctx, { plan, clock, run }): Promise<Evidence> => {
      const path = containedRepositoryPath(plan.repositoryRoot, ctx.input.path)
      if (path !== containedRepositoryPath(plan.repositoryRoot, plan.codePath)) {
        throw new TriageError("authorize", ctx.input.path, "Repository request does not match the configured code path")
      }
      const result = await run.exec({
        input: {
          command: "git",
          args: [
            "-C",
            plan.repositoryRoot,
            "grep",
            "-n",
            "--full-name",
            "-F",
            plan.codeQuery,
            ctx.input.revision,
            "--",
            plan.codePath,
          ],
        },
      })
      if (result.exitCode !== 0 && result.exitCode !== 1) throw new TriageError("evidence", ctx.input.path, result.stderr.trim() || "git grep failed")
      const matches = result.stdout.trim()
      const first = matches.split("\n").find(Boolean)
      const location = first?.match(/^([^:]+):(\d+):/)
      const citation = location
        ? `${ctx.input.revision}:${location[1]}:L${location[2]}`
        : `${ctx.input.revision}:${plan.codePath}`
      return {
        id: `repository:${digest({ revision: ctx.input.revision, query: plan.codeQuery, path: plan.codePath })}`,
        source: "repository",
        citation,
        capturedAt: new Date(clock()).toISOString(),
        maxAgeMs: plan.evidenceMaxAgeMs,
        queryIdentity: digest(ctx.input),
        revisionIdentity: ctx.input.revision,
        capabilityScope: "repository:read",
        summary: matches || `No fixed-string matches for ${JSON.stringify(plan.codeQuery)} under ${plan.codePath}`,
      }
    },
  }),
}

export const repositoryBinding = ports.repository(repository.read)
