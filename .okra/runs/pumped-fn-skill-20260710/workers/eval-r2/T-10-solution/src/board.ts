import { atom, controller, flow, resource, typed } from "@pumped-fn/lite"
import { boardLink, type Departure } from "./board-link.js"

export const displayAddress = atom({
  factory: () => "harbor-main",
})

export const displayFeed = resource({
  name: "display-feed",
  ownership: "boundary",
  deps: { address: displayAddress },
  factory: (ctx, { address }) => {
    const changes = ctx.changes(displayAddress)[Symbol.asyncIterator]()
    async function watchAddress() {
      const first = await changes.next()
      if (first.done) return
      const next = await changes.next()
      if (!next.done && next.value !== address) {
        await ctx.release(displayFeed)
        await ctx.resolve(displayFeed)
      }
    }

    void watchAddress()
    return address
  },
})

export const displaySession = resource({
  name: "display-session",
  ownership: "boundary",
  deps: {
    boardLink,
    feed: controller(displayFeed, { resolve: true, watch: true }),
  },
  factory: async (ctx, { boardLink: link, feed }) => {
    const session = await ctx.exec({
      fn: (_ctx, address: string) => link.open(address),
      params: [feed.get()],
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
  deps: { address: controller(displayAddress, { resolve: true }) },
  factory: (ctx, { address }) => {
    if (address.get() !== ctx.input.address) address.set(ctx.input.address)
    return { address: ctx.input.address }
  },
})
