import { describe, expect, it } from "vitest"
import { runSyncStress } from "../src/main"

describe("lite sync practical", () => {
  it("proves draft sync stress with invalid payload and conflict evidence", async () => {
    let tick = 0
    const result = await runSyncStress({
      edits: 100,
      now: () => tick++,
    })

    expect(result).toMatchObject({
      edits: 100,
      final: {
        id: "draft",
        title: "Proposal 100",
        body: "Body revision 100",
        version: 100,
      },
      invalidPayloadRejects: 2,
      invalidApplyCount: 0,
      conflictCount: 2,
      localWriteMs: 1,
      localWriteMsPerOp: 0.01,
    })
    expect(result.records).toBeGreaterThanOrEqual(102)
  })

  it("runs with default stress settings and real timing", async () => {
    const result = await runSyncStress()

    expect(result.edits).toBe(250)
    expect(result.final.version).toBe(250)
    expect(result.invalidApplyCount).toBe(0)
    expect(result.localWriteMs).toBeGreaterThanOrEqual(0)
    expect(result.localWriteMsPerOp).toBeGreaterThanOrEqual(0)
  })
})
