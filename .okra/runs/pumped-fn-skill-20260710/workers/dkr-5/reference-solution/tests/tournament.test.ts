import { describe, expect, it } from "vitest"
import { createScope } from "@pumped-fn/lite"
import { generateRound, listRounds, pairEntrants } from "../src/tournament.ts"

const four = [
  { id: "anna", points: 3 },
  { id: "boris", points: 2 },
  { id: "carl", points: 1 },
  { id: "dina", points: 0 },
]
const five = [...four, { id: "elke", points: -1 }]

const withSession = async (
  run: (session: ReturnType<ReturnType<typeof createScope>["createContext"]>) => Promise<void>,
) => {
  const scope = createScope()
  const session = scope.createContext()
  await run(session)
  await session.close()
  await scope.dispose()
}

describe("generateRound", () => {
  it("publishes one complete round for an even field", async () => {
    await withSession(async (session) => {
      const result = await session.exec({ flow: generateRound, input: { entrants: four } })
      expect(result).toEqual({ pairingCount: 2, bye: null, staged: 2 })
      expect(await session.exec({ flow: listRounds })).toEqual([
        {
          round: 1,
          pairings: [
            ["anna", "boris"],
            ["carl", "dina"],
          ],
          bye: null,
        },
      ])
    })
  })

  it("stages the lowest seed's bye inside the same operation", async () => {
    await withSession(async (session) => {
      const result = await session.exec({ flow: generateRound, input: { entrants: five } })
      expect(result).toEqual({ pairingCount: 2, bye: "elke", staged: 3 })
      const rounds = await session.exec({ flow: listRounds })
      expect(rounds[0]?.bye).toBe("elke")
    })
  })

  it("keeps sibling generations on one session isolated", async () => {
    await withSession(async (session) => {
      const first = await session.exec({ flow: generateRound, input: { entrants: four } })
      const second = await session.exec({ flow: generateRound, input: { entrants: four } })
      expect(first.staged).toBe(2)
      expect(second.staged).toBe(2)
      const rounds = await session.exec({ flow: listRounds })
      expect(rounds.map((round) => round.round)).toEqual([1, 2])
    })
  })

  it("discards the whole generation when the bye is exhausted", async () => {
    await withSession(async (session) => {
      await session.exec({ flow: generateRound, input: { entrants: five } })
      await expect(
        session.exec({ flow: generateRound, input: { entrants: five } }),
      ).rejects.toThrow()
      expect(await session.exec({ flow: listRounds })).toHaveLength(1)
      const recovered = await session.exec({ flow: generateRound, input: { entrants: four } })
      expect(recovered.staged).toBe(2)
      const rounds = await session.exec({ flow: listRounds })
      expect(rounds.map((round) => round.round)).toEqual([1, 2])
    })
  })

  it("publishes nothing from a standalone sub-operation", async () => {
    await withSession(async (session) => {
      const result = await session.exec({ flow: pairEntrants, input: { entrants: four } })
      expect(result).toEqual({ pairingCount: 2 })
      expect(await session.exec({ flow: listRounds })).toEqual([])
    })
  })
})
