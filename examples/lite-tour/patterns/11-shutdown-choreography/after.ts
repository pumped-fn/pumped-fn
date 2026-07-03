import { atom, flow, tag, tags } from "@pumped-fn/lite"

export const shutdownEvents = tag<string[]>({ label: "p11.shutdown.events" })

export const config = atom({
  deps: { events: tags.required(shutdownEvents) },
  factory: (ctx, { events }) => {
    events.push("config:open")
    ctx.cleanup(() => {
      events.push("config:close")
    })
    return { name: "main" }
  },
})

export const pool = atom({
  deps: {
    config,
    events: tags.required(shutdownEvents),
  },
  factory: (ctx, { config, events }) => {
    events.push("pool:open")
    ctx.cleanup(() => {
      events.push("pool:close")
    })
    return {
      events,
      name: config.name,
    }
  },
})

export const server = atom({
  deps: {
    events: tags.required(shutdownEvents),
    pool,
  },
  factory: (ctx, { events, pool }) => {
    events.push("server:open")
    ctx.cleanup(() => {
      events.push("server:close")
    })
    return {
      events,
      id: `server:${pool.name}`,
    }
  },
})

export const gracefulDrain = flow({
  name: "p11.graceful-drain",
  deps: { server },
  factory: async (ctx, { server }) => {
    ctx.onClose(() => {
      server.events.push("request:close")
    })
    server.events.push("request:start")
    await Promise.resolve()
    server.events.push("request:end")
    return server.id
  },
})

export const throwingCleanup = atom({
  deps: { events: tags.required(shutdownEvents) },
  factory: (ctx, { events }) => {
    events.push("throwing:open")
    ctx.cleanup(() => {
      events.push("throwing:survivor")
    })
    ctx.cleanup(() => {
      events.push("throwing:throw")
      throw new Error("cleanup failed")
    })
    return "throwing"
  },
})
