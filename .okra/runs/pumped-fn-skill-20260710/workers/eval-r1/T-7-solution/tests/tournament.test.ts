import { createScope } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { assignBye, generateRound, listRounds, pairEntrants } from "../src/tournament.js"

async function withSession(run: (session: ReturnType<ReturnType<typeof createScope>["createContext"]>) => Promise<void>) {
  const scope = createScope()
  const session = scope.createContext()
  try {
    await run(session)
    await session.close({ ok: true })
  } catch (error) {
    await session.close({ ok: false, error })
    throw error
  } finally {
    await scope.dispose()
  }
}

describe("tournament rounds", () => {
  it("seeds, pairs, assigns a bye, and publishes consecutive rounds", async () => {
    await withSession(async session => {
      await expect(session.exec({
        flow: generateRound,
        input: { entrants: [{ id: "zoe", points: 1 }, { id: "amy", points: 3 }, { id: "bob", points: 3 }, { id: "cal", points: 2 }, { id: "dan", points: 0 }] },
      })).resolves.toEqual({ pairingCount: 2, bye: "dan", staged: 3 })
      await session.exec({
        flow: generateRound,
        input: { entrants: [{ id: "amy", points: 4 }, { id: "bob", points: 3 }, { id: "cal", points: 2 }, { id: "zoe", points: 1 }] },
      })
      await expect(session.exec({ flow: listRounds })).resolves.toEqual([
        { round: 1, pairings: [["amy", "bob"], ["cal", "zoe"]], bye: "dan" },
        { round: 2, pairings: [["amy", "bob"], ["cal", "zoe"]], bye: null },
      ])
    })
  })

  it("does not publish invalid or exhausted rounds", async () => {
    await withSession(async session => {
      await expect(session.exec({
        flow: generateRound,
        input: { entrants: [{ id: "a", points: 1 }, { id: "a", points: 0 }] },
      })).rejects.toMatchObject({ fault: { code: "INVALID_ENTRANTS" } })
      await session.exec({
        flow: generateRound,
        input: { entrants: [{ id: "a", points: 2 }, { id: "b", points: 1 }, { id: "c", points: 0 }] },
      })
      await expect(session.exec({
        flow: generateRound,
        input: { entrants: [{ id: "a", points: 2 }, { id: "b", points: 1 }, { id: "c", points: 0 }] },
      })).rejects.toMatchObject({ fault: { code: "BYE_EXHAUSTED" } })
      await expect(session.exec({ flow: listRounds })).resolves.toHaveLength(1)
    })
  })

  it("keeps standalone staging private", async () => {
    await withSession(async session => {
      await expect(session.exec({
        flow: pairEntrants,
        input: { entrants: [{ id: "b", points: 1 }, { id: "a", points: 1 }] },
      })).resolves.toEqual({ pairingCount: 1 })
      await expect(session.exec({ flow: assignBye, input: { candidate: "b" } })).resolves.toEqual({ bye: "b" })
      await expect(session.exec({ flow: listRounds })).resolves.toEqual([])
    })
  })

  it("isolates concurrent workspaces and assigns round numbers at publication", async () => {
    await withSession(async session => {
      const first = session.exec({
        flow: generateRound,
        input: { entrants: [{ id: "a", points: 3 }, { id: "b", points: 2 }, { id: "c", points: 0 }] },
      })
      const second = session.exec({
        flow: generateRound,
        input: { entrants: [{ id: "d", points: 3 }, { id: "e", points: 2 }, { id: "f", points: 0 }] },
      })
      await expect(Promise.all([first, second])).resolves.toEqual([
        { pairingCount: 1, bye: "c", staged: 2 },
        { pairingCount: 1, bye: "f", staged: 2 },
      ])
      const published = await session.exec({ flow: listRounds })
      expect(published.map(round => round.round)).toEqual([1, 2])
      expect(published.map(round => `${round.pairings[0].join("-")}:${round.bye}`).sort()).toEqual([
        "a-b:c",
        "d-e:f",
      ])
    })
  })
})
