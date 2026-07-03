import { controller, flow, resource, tag, tags } from "@pumped-fn/lite"

export interface RequestUser {
  readonly id: string
}

export interface RequestSession {
  readonly marker: symbol
  readonly user: RequestUser
}

export const requestUser = tag<RequestUser>({ label: "request.user" })
export const requestEvents = tag<string[]>({ label: "request.events" })

export const requestSession = resource({
  name: "p10.request-session",
  deps: {
    events: tags.optional(requestEvents),
    user: tags.required(requestUser),
  },
  factory: (ctx, { events, user }) => {
    events?.push(`open:${user.id}`)
    ctx.cleanup(() => {
      events?.push(`close:${user.id}`)
    })
    return {
      marker: Symbol(user.id),
      user,
    }
  },
})

export const asyncSession = flow({
  name: "p10.async-session",
  deps: { session: requestSession },
  factory: async (_, { session }) => {
    await Promise.resolve()
    return {
      marker: session.marker,
      userId: session.user.id,
    }
  },
})

export const nestedSession = flow({
  name: "p10.nested-session",
  deps: { asyncSession: controller(asyncSession) },
  factory: async (_ctx, { asyncSession }) => {
    const first = await asyncSession.exec()
    const second = await asyncSession.exec()

    return {
      firstUserId: first.userId,
      marker: first.marker,
      sameInstance: first.marker === second.marker,
      secondUserId: second.userId,
    }
  },
})
