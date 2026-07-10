import { createScope } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { assignBye, generateRound, listRounds, pairEntrants } from "../src/tournament.js"

describe("tournament rounds", () => {
  it("seeds, pairs, assigns a bye, and publishes consecutive rounds", async () => {
    const scope = createScope()
    const session = scope.createContext()
    await expect(session.exec({
      flow: generateRound,
      input: { entrants: [
        { id: "zoe", points: 1 },
        { id: "amy", points: 3 },
        { id: "bob", points: 3 },
        { id: "cal", points: 2 },
        { id: "dan", points: 0 },
      ] },
    })).resolves.toEqual({ pairingCount: 2, bye: "dan", staged: 3 })
    await expect(session.exec({
      flow: generateRound,
      input: { entrants: [
        { id: "amy", points: 4 },
        { id: "bob", points: 3 },
        { id: "cal", points: 2 },
        { id: "zoe", points: 1 },
      ] },
    })).resolves.toEqual({ pairingCount: 2, bye: null, staged: 2 })
    await expect(session.exec({ flow: listRounds })).resolves.toEqual([
      { round: 1, pairings: [["amy", "bob"], ["cal", "zoe"]], bye: "dan" },
      { round: 2, pairings: [["amy", "bob"], ["cal", "zoe"]], bye: null },
    ])
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("rejects invalid entrants without publishing a partial round", async () => {
    const scope = createScope()
    const session = scope.createContext()
    await expect(session.exec({
      flow: generateRound,
      input: { entrants: [{ id: "amy", points: 1 }, { id: "amy", points: 0 }] },
    })).rejects.toMatchObject({ fault: { code: "INVALID_ENTRANTS" } })
    await expect(session.exec({ flow: listRounds })).resolves.toEqual([])
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("rejects a field with fewer than two entrants", async () => {
    const scope = createScope()
    const session = scope.createContext()
    await expect(session.exec({
      flow: generateRound,
      input: { entrants: [{ id: "amy", points: 1 }] },
    })).rejects.toMatchObject({ fault: { code: "INVALID_ENTRANTS" } })
    await expect(session.exec({ flow: listRounds })).resolves.toEqual([])
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("rejects an already-used lowest seed and leaves the record unchanged", async () => {
    const scope = createScope()
    const session = scope.createContext()
    await session.exec({
      flow: generateRound,
      input: { entrants: [
        { id: "amy", points: 3 },
        { id: "bob", points: 2 },
        { id: "cal", points: 1 },
      ] },
    })
    await expect(session.exec({
      flow: generateRound,
      input: { entrants: [
        { id: "amy", points: 4 },
        { id: "bob", points: 3 },
        { id: "cal", points: 0 },
      ] },
    })).rejects.toMatchObject({ fault: { code: "BYE_EXHAUSTED" } })
    await expect(session.exec({ flow: listRounds })).resolves.toHaveLength(1)
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("stages standalone operations without publishing them", async () => {
    const scope = createScope()
    const session = scope.createContext()
    await expect(session.exec({
      flow: pairEntrants,
      input: { entrants: [{ id: "b", points: 1 }, { id: "a", points: 1 }] },
    })).resolves.toEqual({ pairingCount: 1 })
    await expect(session.exec({ flow: assignBye, input: { candidate: "a" } })).resolves.toEqual({ bye: "a" })
    await expect(session.exec({ flow: listRounds })).resolves.toEqual([])
    await session.close({ ok: true })
    await scope.dispose()
  })

  it("keeps concurrent generation workspaces isolated", async () => {
    const scope = createScope()
    const session = scope.createContext()
    const first = session.exec({
      flow: generateRound,
      input: { entrants: [
        { id: "amy", points: 2 },
        { id: "bob", points: 1 },
      ] },
    })
    const second = session.exec({
      flow: generateRound,
      input: { entrants: [
        { id: "cal", points: 2 },
        { id: "dan", points: 1 },
        { id: "eve", points: 0 },
      ] },
    })
    await expect(Promise.all([first, second])).resolves.toEqual([
      { pairingCount: 1, bye: null, staged: 1 },
      { pairingCount: 1, bye: "eve", staged: 2 },
    ])
    await expect(session.exec({ flow: listRounds })).resolves.toEqual([
      { round: 1, pairings: [["amy", "bob"]], bye: null },
      { round: 2, pairings: [["cal", "dan"]], bye: "eve" },
    ])
    await session.close({ ok: true })
    await scope.dispose()
  })
})
