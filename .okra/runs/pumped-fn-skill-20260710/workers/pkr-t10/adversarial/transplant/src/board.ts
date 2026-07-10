import { atom, controller, flow, typed } from "@pumped-fn/lite"
import { boardLink } from "./board-link.ts"
import type { BoardSession, Departure } from "./board-link.ts"

export const displayAddress = atom({
  factory: () => "harbor-main",
})

export const displayFeed = atom({
  deps: { address: controller(displayAddress, { resolve: true, watch: true }) },
  factory: (_ctx, { address }) => ({ address: address.get() }),
})

let current: BoardSession | null = null

export const renderDepartures = flow({
  name: "renderDepartures",
  parse: typed<{ departures: Departure[] }>(),
  deps: { link: boardLink, feed: displayFeed },
  factory: (ctx, { link, feed }) => {
    if (!current) {
      current = link.open(feed.address)
    }
    current.render(ctx.input.departures)
    return { rendered: ctx.input.departures.length }
  },
})

export const retarget = flow({
  name: "retarget",
  parse: typed<{ address: string }>(),
  deps: { link: boardLink, address: controller(displayAddress, { resolve: true }) },
  factory: (ctx, { link, address }) => {
    address.set(ctx.input.address)
    if (current) {
      current.close()
    }
    current = link.open(ctx.input.address)
    return { address: ctx.input.address }
  },
})

export const displaySession = atom({
  deps: { link: boardLink },
  factory: () => current,
})
