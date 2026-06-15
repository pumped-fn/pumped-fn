import { flow, typed, controller } from "@pumped-fn/lite"
import { bffClient } from "./bff"
import { sessionToken } from "./session"

export const signIn = flow({
  name: "sign-in",
  parse: typed<{ email: string; password: string }>(),
  deps: { client: bffClient, tokenControl: controller(sessionToken, { resolve: true }) },
  factory: async (ctx, { client, tokenControl }) => {
    const { token } = await client.login(ctx.input.email, ctx.input.password)
    tokenControl.set(token)
  },
})
