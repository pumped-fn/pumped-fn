import { describe, expect, it } from "vitest"
import { runDevWorkflow } from "../examples/dev-workflow"

describe("development workflow example", () => {
  it("develops, tests, waits for review, then resumes without repeating completed work", async () => {
    const result = await runDevWorkflow(
      {
        ticket: "FEAT-12",
        request: "Add release checklist",
      },
      {
        taskId: "feature-FEAT-12",
        runId: "dev-run",
        approval: "approved-by-product",
      }
    )

    expect(result.suspended).toBe(true)
    expect(result.calls).toEqual({ implement: 1, test: 1 })
    expect(result.result).toMatchObject({
      taskId: "feature-FEAT-12",
      runId: "dev-run",
      ticket: "FEAT-12",
      approval: "approved-by-product",
      status: "ready-to-merge",
      tests: {
        passed: true,
        command: "pnpm test -- audit-trail",
      },
    })

    const completed = result.entries
      .filter((entry) => entry.status === "completed")
      .map((entry) => entry.targetName)
    expect(completed).toContain("implement-feature")
    expect(completed).toContain("run-feature-tests")
    expect(result.entries).toContainEqual(expect.objectContaining({
      status: "resolved",
      targetName: "await-product-review",
      value: "approved-by-product",
    }))
  })
})
