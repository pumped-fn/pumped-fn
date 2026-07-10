import { flow, typed } from "@pumped-fn/lite"

type Entrant = { id: string; points: number }
type Pairing = [string, string]
type Round = { round: number; pairings: Pairing[]; bye: string | null }

const db = {
  rounds: [] as Round[],
  transaction: <T>(work: () => T): T => work(),
}

const triageOrder = (entrants: Entrant[]) =>
  [...entrants].sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))

export const pairEntrants = flow({
  name: "pair-entrants",
  parse: typed<{ entrants: Entrant[] }>(),
  factory: (ctx) => {
    const order = triageOrder(ctx.input.entrants)
    const pairings: Pairing[] = []
    for (let index = 0; index + 1 < order.length; index += 2) {
      pairings.push([order[index].id, order[index + 1].id])
    }
    return { pairingCount: pairings.length, pairings }
  },
})

export const assignBye = flow({
  name: "assign-bye",
  parse: typed<{ candidate: string }>(),
  factory: (ctx) => {
    if (db.rounds.some((round) => round.bye === ctx.input.candidate)) {
      throw new Error(`BYE_EXHAUSTED: ${ctx.input.candidate}`)
    }
    return { bye: ctx.input.candidate }
  },
})

export const generateRound = flow({
  name: "generate-round",
  parse: typed<{ entrants: Entrant[] }>(),
  factory: (ctx) => {
    const { entrants } = ctx.input
    const unique = new Set(entrants.map((entrant) => entrant.id))
    if (entrants.length < 2 || unique.size !== entrants.length) {
      throw new Error("INVALID_ENTRANTS")
    }
    return db.transaction(() => {
      const order = triageOrder(entrants)
      const even = order.length % 2 === 0
      const target: Round = { round: db.rounds.length + 1, pairings: [], bye: null }
      db.rounds.push(target)
      for (let index = 0; index + 1 < order.length; index += 2) {
        target.pairings.push([order[index].id, order[index + 1].id])
      }
      if (!even) {
        const candidate = order[order.length - 1].id
        if (db.rounds.some((round) => round !== target && round.bye === candidate)) {
          throw new Error(`BYE_EXHAUSTED: ${candidate}`)
        }
        target.bye = candidate
      }
      return {
        pairingCount: target.pairings.length,
        bye: target.bye,
        staged: target.pairings.length + (target.bye === null ? 0 : 1),
      }
    })
  },
})

export const listRounds = flow({
  name: "list-rounds",
  parse: typed<void>(),
  factory: () => db.rounds.map((round) => ({ ...round, pairings: round.pairings.map((pairing) => [...pairing] as Pairing) })),
})
