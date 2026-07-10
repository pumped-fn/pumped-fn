import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"

type Entrant = { id: string; points: number }
type Pairing = [string, string]
type Round = { round: number; pairings: Pairing[]; bye: string | null }

const ledger = atom({
  factory: () => ({ rounds: [] as Round[] }),
})

export const workspace = resource({
  name: "round-workspace",
  ownership: "current",
  deps: { ledger },
  factory: (ctx, { ledger }) => {
    const pairings: Pairing[] = []
    ctx.onClose((result) => {
      if (result.ok) {
        ledger.rounds.push({ round: ledger.rounds.length + 1, pairings, bye: null })
      }
    })
    return {
      stagePairing: (pairing: Pairing) => {
        pairings.push(pairing)
      },
    }
  },
})

const staging: { pairings: Pairing[]; bye: string | null } = { pairings: [], bye: null }

const seeded = (entrants: Entrant[]) =>
  [...entrants].sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))

export const pairEntrants = flow({
  name: "pair-entrants",
  parse: typed<{ entrants: Entrant[] }>(),
  deps: { ledger },
  factory: (ctx) => {
    const order = seeded(ctx.input.entrants)
    for (let index = 0; index + 1 < order.length; index += 2) {
      staging.pairings.push([order[index].id, order[index + 1].id])
    }
    return { pairingCount: Math.floor(order.length / 2) }
  },
})

export const assignBye = flow({
  name: "assign-bye",
  parse: typed<{ candidate: string }>(),
  deps: { ledger },
  factory: (ctx, { ledger }) => {
    if (ledger.rounds.some((round) => round.bye === ctx.input.candidate)) {
      throw new Error(`BYE_EXHAUSTED: ${ctx.input.candidate}`)
    }
    staging.bye = ctx.input.candidate
    return { bye: ctx.input.candidate }
  },
})

export const generateRound = flow({
  name: "generate-round",
  parse: typed<{ entrants: Entrant[] }>(),
  deps: {
    ledger,
    pairing: controller(pairEntrants),
    byeStep: controller(assignBye),
  },
  factory: async (ctx, { ledger, pairing, byeStep }) => {
    const { entrants } = ctx.input
    const unique = new Set(entrants.map((entrant) => entrant.id))
    if (entrants.length < 2 || unique.size !== entrants.length) {
      throw new Error("INVALID_ENTRANTS")
    }
    const order = seeded(entrants)
    const even = order.length % 2 === 0
    const { pairingCount } = await pairing.exec({
      input: { entrants: even ? order : order.slice(0, -1) },
    })
    const bye = even
      ? null
      : (await byeStep.exec({ input: { candidate: order[order.length - 1].id } })).bye
    const staged = staging.pairings.length + (staging.bye === null ? 0 : 1)
    ledger.rounds.push({
      round: ledger.rounds.length + 1,
      pairings: staging.pairings.splice(0, staging.pairings.length),
      bye: staging.bye,
    })
    staging.bye = null
    return { pairingCount, bye, staged }
  },
})

export const listRounds = flow({
  name: "list-rounds",
  parse: typed<void>(),
  deps: { ledger },
  factory: (_ctx, { ledger }) =>
    ledger.rounds.map((round) => ({
      round: round.round,
      pairings: round.pairings.map((pairing) => [...pairing] as Pairing),
      bye: round.bye,
    })),
})
