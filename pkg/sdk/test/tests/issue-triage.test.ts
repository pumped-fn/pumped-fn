import { describe, expect, it } from "vitest"
import { objectiveIds, runVerifier } from "../examples/issue-triage/verify.js"

describe("issue triage vertical", () => {
  it("proves all sixteen fixed objective contracts", async () => {
    const result = await runVerifier()
    expect(result.contracts.map((contract) => contract.id)).toEqual(objectiveIds)
    expect(result.contracts.filter((contract) => !contract.passed)).toEqual([])
    expect(result).toMatchObject({ target: 16, passedCount: 16 })
  })
})
