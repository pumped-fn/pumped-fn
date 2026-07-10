import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"

export type Entrant = { id: string; points: number }
export type Pairing = [string, string]
export type Round = { round: number; pairings: Pairing[]; bye: string | null }

type Fault = { code: "INVALID_ENTRANTS" } | { code: "BYE_EXHAUSTED"; entrant: string }

const ledger = atom({
  factory: () => ({ rounds: [] as Round[] }),
})

const workspace = resource({
  name: "round-workspace",
  ownership: "current",
  deps: { ledger },
  factory: (ctx, { ledger }) => {
    const pairings: Pairing[] = []
    let bye: string | null = null
    let opened = false
    ctx.onClose((result) => {
      if (result.ok && opened) {
        ledger.rounds.push({
          round: ledger.rounds.length + 1,
          pairings: pairings.map((pairing) => [...pairing] as Pairing),
          bye,
        })
      }
    })
    return {
      open: () => {
        opened = true
      },
      stagePairing: (pairing: Pairing) => {
        pairings.push(pairing)
      },
      stageBye: (entrant: string) => {
        bye = entrant
      },
      staged: () => pairings.length + (bye === null ? 0 : 1),
    }
  },
})

const seeded = (entrants: Entrant[]) =>
  [...entrants].sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))

export const pairEntrants = flow({
  name: "pair-entrants",
  parse: typed<{ entrants: Entrant[] }>(),
  deps: { workspace },
  factory: (ctx, { workspace }) => {
    const order = seeded(ctx.input.entrants)
    for (let index = 0; index + 1 < order.length; index += 2) {
      workspace.stagePairing([order[index].id, order[index + 1].id])
    }
    return { pairingCount: Math.floor(order.length / 2) }
  },
})

export const assignBye = flow({
  name: "assign-bye",
  parse: typed<{ candidate: string }>(),
  faults: typed<Fault>(),
  deps: { workspace, ledger },
  factory: (ctx, { workspace, ledger }) => {
    if (ledger.rounds.some((round) => round.bye === ctx.input.candidate)) {
      return ctx.fail({ code: "BYE_EXHAUSTED", entrant: ctx.input.candidate })
    }
    workspace.stageBye(ctx.input.candidate)
    return { bye: ctx.input.candidate }
  },
})

export const generateRound = flow({
  name: "generate-round",
  parse: typed<{ entrants: Entrant[] }>(),
  faults: typed<Fault>(),
  deps: {
    workspace,
    pairing: controller(pairEntrants),
    byeStep: controller(assignBye),
  },
  factory: async (ctx, { workspace, pairing, byeStep }) => {
    const { entrants } = ctx.input
    const unique = new Set(entrants.map((entrant) => entrant.id))
    if (entrants.length < 2 || unique.size !== entrants.length) {
      return ctx.fail({ code: "INVALID_ENTRANTS" })
    }
    workspace.open()
    const order = seeded(entrants)
    const even = order.length % 2 === 0
    const { pairingCount } = await pairing.exec({
      input: { entrants: even ? order : order.slice(0, -1) },
    })
    const bye = even
      ? null
      : (await byeStep.exec({ input: { candidate: order[order.length - 1].id } })).bye
    return { pairingCount, bye, staged: workspace.staged() }
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
