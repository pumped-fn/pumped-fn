import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"
import { boardLink, type BoardSession, type Departure } from "./board-link.js"

export const displayAddress = atom({
  factory: () => "harbor-main",
})

export const displayFeed = resource({
  name: "display-feed",
  ownership: "boundary",
  deps: { address: displayAddress },
  factory: (ctx, { address }) => ({
    address,
    refresh: async () => {
      await ctx.release(displayFeed)
      await ctx.resolve(displayFeed)
    },
  }),
})

export const displaySession = resource({
  name: "display-session",
  ownership: "boundary",
  deps: {
    boardLink,
    displayFeed: controller(displayFeed, { resolve: true, watch: true }),
  },
  factory: async (ctx, { boardLink, displayFeed }) => {
    const session = await ctx.exec({
      fn: (_ctx, address: string) => boardLink.open(address),
      params: [displayFeed.get().address],
      name: "board.open",
    })
    ctx.cleanup(() => session.close())
    return session
  },
})

export const renderDepartures = flow({
  name: "render-departures",
  parse: typed<{ departures: Departure[] }>(),
  deps: { displaySession },
  factory: async (ctx, { displaySession }) => {
    await ctx.exec({
      fn: (_ctx, departures: Departure[]) => displaySession.render(departures),
      params: [ctx.input.departures],
      name: "board.render",
    })
    return { rendered: ctx.input.departures.length }
  },
})

export const retarget = flow({
  name: "retarget",
  parse: typed<{ address: string }>(),
  deps: {
    displayAddress: controller(displayAddress, { resolve: true }),
    feed: displayFeed,
  },
  factory: async (ctx, { displayAddress, feed }) => {
    if (displayAddress.get() !== ctx.input.address) {
      displayAddress.set(ctx.input.address)
      await ctx.exec({
        fn: (_ctx, feed) => feed.refresh(),
        params: [feed],
        name: "display-feed.refresh",
      })
    }
    return { address: ctx.input.address }
  },
})
