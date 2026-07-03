import { preset } from "@pumped-fn/lite"
import { pumped } from "@pumped-fn/pumped"
import { describe, expect, it } from "vitest"
import { actor, configureLot, createMemoryStore, now, store } from "@pumped-fn/parking-lot-shared"

function manifest(): pumped.Manifest {
  return {
    app: {
      presets: [preset(store, createMemoryStore())],
      context: () => [actor({ id: "manager-1", role: "manager" }), now(() => "2026-07-01T08:00:00.000Z")],
    },
    entries: [{ kind: "cli", name: "configure", file: "virtual", flow: configureLot }],
  }
}

describe("parking lot app cli entry", () => {
  it("runs the configure command with --json input", async () => {
    const lines: string[] = []

    await pumped.runCli(
      manifest(),
      [
        "configure",
        "--json",
        JSON.stringify({
          bookingLeadMinutes: 120,
          capacity: 5,
          currency: "USD",
          graceMinutes: 10,
          name: "Harbor",
          rateCentsPerHour: 300,
          refundWindowMinutes: 1440,
        }),
      ],
      { out: (line) => lines.push(line), err: () => {} }
    )

    const output = JSON.parse(lines[0]!)
    expect(output.name).toBe("Harbor")
  })
})
