import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"

export type Target = "staging" | "production"

export interface DeployInput {
  service: string
  target: Target
  dryRun: boolean
  actor?: string
}

export interface DeployPlan {
  operation: string
  actor: string
  service: string
  target: Target
  current: string
  next: string
  dryRun: boolean
  steps: string[]
}

export interface AuditInput {
  json: boolean
  actor?: string
}

export interface AuditReport {
  operation: string
  actor: string
  format: "json" | "text"
  services: ServiceReadiness[]
  risky: number
}

export interface ServiceReadiness {
  service: string
  current: string
  staging: string
  production: string
  pendingChecks: number
}

interface ReleaseRecord {
  service: string
  current: string
  staging: string
  production: string
  pendingChecks: number
}

interface Registry {
  service(name: string): ReleaseRecord
  list(): ReleaseRecord[]
  nextVersion(record: ReleaseRecord, target: Target): string
}

export const operation = tag<string>({ label: "cli.operation" })

export const actor = tag<string>({ label: "cli.actor", default: "local" })

export const registry = atom({
  factory: (): Registry => {
    const records = new Map<string, ReleaseRecord>([
      ["api", { service: "api", current: "1.8.2", staging: "1.9.0-rc.2", production: "1.8.2", pendingChecks: 0 }],
      ["worker", { service: "worker", current: "4.2.0", staging: "4.3.0-rc.1", production: "4.1.9", pendingChecks: 2 }],
    ])

    return {
      service(name) {
        const record = records.get(name)
        if (record === undefined) throw new Error(`unknown service: ${name}`)
        return record
      },
      list() {
        return [...records.values()]
      },
      nextVersion(record, target) {
        return target === "production" ? record.staging : `${record.current}-next`
      },
    }
  },
})

export const deploymentPlan = flow({
  name: "deployment-plan",
  parse: typed<DeployInput>(),
  deps: {
    registry,
    logger: logging.logger,
    operation: tags.required(operation),
    actor: tags.required(actor),
  },
  factory: (ctx, deps): DeployPlan => {
    const record = deps.registry.service(ctx.input.service)
    const next = deps.registry.nextVersion(record, ctx.input.target)
    const steps = [
      `load ${record.service}`,
      `promote ${record.current} to ${next}`,
      ctx.input.dryRun ? "write plan" : "execute release",
    ]

    deps.logger.info("deploy.plan", {
      operation: deps.operation,
      actor: deps.actor,
      service: record.service,
      target: ctx.input.target,
      dryRun: ctx.input.dryRun,
    })

    return {
      operation: deps.operation,
      actor: deps.actor,
      service: record.service,
      target: ctx.input.target,
      current: record.current,
      next,
      dryRun: ctx.input.dryRun,
      steps,
    }
  },
})

export const auditReadiness = flow({
  name: "audit-readiness",
  parse: typed<AuditInput>(),
  deps: {
    registry,
    logger: logging.logger,
    operation: tags.required(operation),
    actor: tags.required(actor),
  },
  factory: (ctx, deps): AuditReport => {
    const services = deps.registry.list().map((record) => ({
      service: record.service,
      current: record.current,
      staging: record.staging,
      production: record.production,
      pendingChecks: record.pendingChecks,
    }))
    const risky = services.filter((service) => service.pendingChecks > 0).length

    deps.logger.info("audit.report", {
      operation: deps.operation,
      actor: deps.actor,
      services: services.length,
      risky,
      json: ctx.input.json,
    })

    return {
      operation: deps.operation,
      actor: deps.actor,
      format: ctx.input.json ? "json" : "text",
      services,
      risky,
    }
  },
})
