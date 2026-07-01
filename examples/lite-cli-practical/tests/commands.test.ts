import { describe, expect, test } from "vitest"
import { audit } from "../src/commands/audit"
import { deploy } from "../src/commands/deploy"

describe("command modules", () => {
  test("deploy creates one operation scope with logs and observable events", async () => {
    const result = await deploy({
      service: "api",
      target: "production",
      dryRun: true,
      actor: "release-bot",
    })

    expect(result.output).toMatchObject({
      operation: "deploy",
      actor: "release-bot",
      service: "api",
      target: "production",
      next: "1.9.0-rc.2",
      dryRun: true,
    })
    expect(result.logs.map((record) => record.message)).toContain("deploy.plan")
    expect(result.events.map((event) => `${event.phase}:${event.kind}:${event.name}`)).toContain(
      "success:flow:deployment-plan",
    )
  })

  test("audit uses the same public seam and keeps operation telemetry", async () => {
    const result = await audit({ json: false, actor: "operator" })

    expect(result.output).toMatchObject({
      operation: "audit",
      actor: "operator",
      format: "text",
      risky: 1,
    })
    expect(result.output.services.map((service) => service.service)).toEqual(["api", "worker"])
    expect(result.logs.map((record) => record.message)).toContain("audit.report")
    expect(result.events.map((event) => `${event.phase}:${event.kind}:${event.name}`)).toContain(
      "success:flow:audit-readiness",
    )
  })
})
