import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"
import { boardLink } from "./board-link.ts"
import type { BoardSession, Departure } from "./board-link.ts"

export const displayAddress = atom({
  factory: () => "harbor-main",
})

export const displayFeed: Lite.Resource<{ address: string }> = resource({
  name: "displayFeed",
  deps: { address: controller(displayAddress, { resolve: true }) },
  factory: (_ctx, { address }) => ({ address: address.get() }),
})

export const displaySession = resource({
  name: "displaySession",
  deps: {
    link: boardLink,
    feed: controller(displayFeed, {
      resolve: true,
      watch: true,
      eq: (a, b) => a.address === b.address,
    }),
  },
  factory: (ctx, { link, feed }) => {
    const session = link.open(feed.get().address)
    ctx.cleanup(() => session.close())
    return session
  },
})

let current: BoardSession | null = null

export const renderDepartures = flow({
  name: "renderDepartures",
  parse: typed<{ departures: Departure[] }>(),
  deps: { link: boardLink, address: controller(displayAddress, { resolve: true }) },
  factory: (ctx, { link, address }) => {
    if (current && current.address !== address.get()) {
      current.close()
      current = null
    }
    if (!current) {
      current = link.open(address.get())
    }
    current.render(ctx.input.departures)
    return { rendered: ctx.input.departures.length }
  },
})

export const retarget = flow({
  name: "retarget",
  parse: typed<{ address: string }>(),
  deps: { address: controller(displayAddress, { resolve: true }) },
  factory: (ctx, { address }) => {
    address.set(ctx.input.address)
    return { address: ctx.input.address }
  },
})
