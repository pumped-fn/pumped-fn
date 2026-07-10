import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"

export type Entrant = { id: string; points: number }

type Pairing = [string, string]
type Round = { round: number; pairings: Pairing[]; bye: string | null }
type Fault = { code: "BYE_EXHAUSTED" | "INVALID_ENTRANTS" }

const rounds = atom({
  factory: () => [] as Round[],
})

const workspace = resource({
  name: "round-workspace",
  ownership: "current",
  factory: () => ({ pairings: [] as Pairing[], bye: null as string | null }),
})

function seed(entrants: Entrant[]): Entrant[] {
  return [...entrants].sort((left, right) =>
    right.points - left.points || left.id.localeCompare(right.id),
  )
}

export const pairEntrants = flow({
  name: "pair-entrants",
  parse: typed<{ entrants: Entrant[] }>(),
  deps: { workspace },
  factory: (ctx, { workspace }) => {
    const entrants = seed(ctx.input.entrants)
    for (let index = 0; index < entrants.length; index += 2) {
      workspace.pairings.push([entrants[index].id, entrants[index + 1].id])
    }
    return { pairingCount: workspace.pairings.length }
  },
})

export const assignBye = flow({
  name: "assign-bye",
  parse: typed<{ candidate: string }>(),
  faults: typed<Fault>(),
  deps: { rounds: controller(rounds, { resolve: true }), workspace },
  factory: (ctx, { rounds, workspace }) => {
    if (rounds.get().some((round) => round.bye === ctx.input.candidate)) {
      return ctx.fail({ code: "BYE_EXHAUSTED" })
    }
    workspace.bye = ctx.input.candidate
    return { bye: workspace.bye }
  },
})

export const generateRound = flow({
  name: "generate-round",
  parse: typed<{ entrants: Entrant[] }>(),
  faults: typed<Fault>(),
  deps: {
    assignBye: controller(assignBye),
    pairEntrants: controller(pairEntrants),
    rounds: controller(rounds, { resolve: true }),
    workspace,
  },
  factory: async (ctx, { assignBye, pairEntrants, rounds, workspace }) => {
    const entrants = ctx.input.entrants
    const ids = new Set(entrants.map((entrant) => entrant.id))
    if (entrants.length < 2 || ids.size !== entrants.length) {
      return ctx.fail({ code: "INVALID_ENTRANTS" })
    }

    const ordered = seed(entrants)
    const bye = ordered.length % 2 === 1 ? ordered.at(-1)?.id ?? null : null
    const field = bye === null ? ordered : ordered.slice(0, -1)
    const pairing = await pairEntrants.exec({ input: { entrants: field } })

    if (bye !== null) {
      await assignBye.exec({ input: { candidate: bye } })
    }

    if (bye !== null && rounds.get().some((round) => round.bye === bye)) {
      return ctx.fail({ code: "BYE_EXHAUSTED" })
    }

    rounds.update((published) => [
      ...published,
      { round: published.length + 1, pairings: workspace.pairings, bye: workspace.bye },
    ])
    return { pairingCount: pairing.pairingCount, bye, staged: workspace.pairings.length + Number(bye !== null) }
  },
})

export const listRounds = flow({
  name: "list-rounds",
  parse: typed<void>(),
  deps: { rounds: controller(rounds, { resolve: true }) },
  factory: (_ctx, { rounds }) => rounds.get().map((round) => ({
    round: round.round,
    pairings: round.pairings.map(([higher, lower]) => [higher, lower] as Pairing),
    bye: round.bye,
  })),
})
