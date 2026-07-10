import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"
import { boardLink } from "./board-link.ts"
import type { Departure } from "./board-link.ts"

export const displayAddress = atom({
  factory: () => "harbor-main",
})

export const displayFeed: Lite.Resource<{ address: string }> = resource({
  name: "displayFeed",
  deps: { address: controller(displayAddress, { resolve: true }) },
  factory: (ctx, { address }) => {
    const self = ctx.controller(displayFeed)
    const unsubscribe = address.on("resolved", () => {
      void self.release().then(() => self.resolve())
    })
    ctx.cleanup(unsubscribe)
    return { address: address.get() }
  },
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

export const renderDepartures = flow({
  name: "renderDepartures",
  parse: typed<{ departures: Departure[] }>(),
  deps: { session: displaySession },
  factory: (ctx, { session }) => {
    session.render(ctx.input.departures)
    return { rendered: ctx.input.departures.length }
  },
})

export const retarget = flow({
  name: "retarget",
  parse: typed<{ address: string }>(),
  deps: {
    address: controller(displayAddress, { resolve: true }),
    feed: controller(displayFeed),
  },
  factory: async (ctx, { address, feed }) => {
    address.set(ctx.input.address)
    await feed.resolve()
    return { address: ctx.input.address }
  },
})
