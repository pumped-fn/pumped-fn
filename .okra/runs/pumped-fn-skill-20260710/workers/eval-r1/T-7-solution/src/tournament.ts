import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"

export type Entrant = {
  id: string
  points: number
}

type Round = {
  round: number
  pairings: [string, string][]
  bye: string | null
}

type Workspace = {
  pairings: [string, string][]
  bye: string | null
}

type TournamentFault = {
  code: "BYE_EXHAUSTED" | "INVALID_ENTRANTS"
}

const rounds = atom({
  factory: () => [] as Round[],
})

const workspace = resource({
  name: "round-workspace",
  ownership: "current",
  factory: () => ({ pairings: [], bye: null }) as Workspace,
})

function invalidEntrants(entrants: Entrant[]): boolean {
  return entrants.length < 2 || new Set(entrants.map(({ id }) => id)).size !== entrants.length
}

function seed(entrants: Entrant[]): Entrant[] {
  return [...entrants].sort((left, right) => right.points - left.points || left.id.localeCompare(right.id))
}

function cloneRound(round: Round): Round {
  return {
    round: round.round,
    pairings: round.pairings.map(([higher, lower]) => [higher, lower]),
    bye: round.bye,
  }
}

export const pairEntrants = flow({
  name: "pair-entrants",
  parse: typed<{ entrants: Entrant[] }>(),
  faults: typed<TournamentFault>(),
  deps: { workspace },
  factory: (ctx, { workspace }) => {
    if (invalidEntrants(ctx.input.entrants) || ctx.input.entrants.length % 2 !== 0) {
      return ctx.fail({ code: "INVALID_ENTRANTS" })
    }
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
  faults: typed<TournamentFault>(),
  deps: { rounds, workspace },
  factory: (ctx, { rounds, workspace }) => {
    if (rounds.some(round => round.bye === ctx.input.candidate)) {
      return ctx.fail({ code: "BYE_EXHAUSTED" })
    }
    workspace.bye = ctx.input.candidate
    return { bye: ctx.input.candidate }
  },
})

export const generateRound = flow({
  name: "generate-round",
  parse: typed<{ entrants: Entrant[] }>(),
  faults: typed<TournamentFault>(),
  deps: {
    rounds: controller(rounds, { resolve: true }),
    workspace,
    pairEntrants: controller(pairEntrants),
    assignBye: controller(assignBye),
  },
  factory: async (ctx, { rounds, workspace, pairEntrants, assignBye }) => {
    if (invalidEntrants(ctx.input.entrants)) return ctx.fail({ code: "INVALID_ENTRANTS" })

    const entrants = seed(ctx.input.entrants)
    const bye = entrants.length % 2 === 0 ? null : entrants.at(-1)!.id
    const field = bye === null ? entrants : entrants.slice(0, -1)
    const { pairingCount } = await pairEntrants.exec({ input: { entrants: field } })

    if (bye !== null) await assignBye.exec({ input: { candidate: bye } })

    let exhausted = false
    rounds.update(published => {
      if (workspace.bye !== null && published.some(round => round.bye === workspace.bye)) {
        exhausted = true
        return published
      }
      return [...published, {
        round: published.length + 1,
        pairings: workspace.pairings.map(([higher, lower]) => [higher, lower]),
        bye: workspace.bye,
      }]
    })
    if (exhausted) return ctx.fail({ code: "BYE_EXHAUSTED" })

    return { pairingCount, bye: workspace.bye, staged: workspace.pairings.length + (workspace.bye === null ? 0 : 1) }
  },
})

export const listRounds = flow({
  name: "list-rounds",
  parse: typed<void>(),
  deps: { rounds },
  factory: (_ctx, { rounds }) => rounds.map(cloneRound),
})
