import { controller, flow, tag, tags } from "@pumped-fn/lite"

export const requestId = tag<string>({ label: "request.id" })
export const channel = tag<string>({ label: "request.channel" })
export const priority = tag<string>({ label: "request.priority", default: "normal" })

export const leaf = flow({
  name: "p02.leaf",
  deps: { requestId: tags.required(requestId) },
  factory: (_, { requestId }) => requestId,
})

export const metadata = flow({
  name: "p02.metadata",
  deps: {
    channel: tags.optional(channel),
    priority: tags.required(priority),
  },
  factory: (_, metadata) => metadata,
})

export const secondHop = flow({
  name: "p02.second-hop",
  deps: { leaf: controller(leaf) },
  factory: (_ctx, { leaf }) => leaf.exec(),
})

export const firstHop = flow({
  name: "p02.first-hop",
  deps: { secondHop: controller(secondHop) },
  factory: (_ctx, { secondHop }) => secondHop.exec(),
})

export const boundary = flow({
  name: "p02.boundary",
  deps: { firstHop: controller(firstHop) },
  factory: (_ctx, { firstHop }) => firstHop.exec(),
})

export const parentSeek = flow({
  name: "p02.parent-seek",
  factory: (ctx) =>
    ctx.exec({
      fn: (child) => child.data.seekTag(requestId),
      params: [],
    }),
})
