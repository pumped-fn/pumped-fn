import { atom, controller, flow, tag, tags, typed } from "@pumped-fn/lite"

export interface User {
  id: string
  name: string
}

export interface Session {
  token: string
  user: User
}

export interface AuthProvider {
  authenticate(email: string, password: string): Promise<Session>
}

export const authBaseUrl = tag<string>({ label: "auth.baseUrl", default: "http://localhost:4000" })

export const authProvider = atom({
  deps: { baseUrl: tags.required(authBaseUrl) },
  factory: (_ctx, { baseUrl }): AuthProvider => {
    const post = async <T>(path: string, body: unknown): Promise<T> => {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("invalid credentials")
      return (await res.json()) as T
    }
    return {
      authenticate: (email, password) => post<Session>("/login", { email, password }),
    }
  },
})

export const session = atom({ factory: (): Session | null => null })

export const login = flow({
  name: "login",
  parse: typed<{ email: string; password: string }>(),
  deps: { provider: authProvider, sessionControl: controller(session, { resolve: true }) },
  factory: async (ctx, { provider, sessionControl }) => {
    const s = await provider.authenticate(ctx.input.email, ctx.input.password)
    sessionControl.set(s)
    return s
  },
})

export const isAuthed = atom({
  deps: { sessionControl: controller(session, { resolve: true, watch: true }) },
  factory: (_ctx, { sessionControl }) => sessionControl.get() !== null,
})

export const logout = flow({
  name: "logout",
  parse: typed<undefined>(),
  deps: { sessionControl: controller(session, { resolve: true }) },
  factory: (_ctx, { sessionControl }) => {
    sessionControl.set(null)
  },
})
