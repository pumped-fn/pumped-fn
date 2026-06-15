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

export interface AuthHttp {
  post<T>(path: string, body: unknown): Promise<T>
}

export interface LoginFormState {
  email: string
  password: string
  error: string | null
}

export const authBaseUrl = tag<string>({ label: "auth.baseUrl", default: "http://localhost:4000" })

export const authHttp = atom({
  deps: { baseUrl: tags.required(authBaseUrl) },
  factory: (_ctx, { baseUrl }): AuthHttp => ({
    post: async <T>(path: string, body: unknown) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error("invalid credentials")
      return (await response.json()) as T
    },
  }),
})

export const authProvider = atom({
  deps: { http: authHttp },
  factory: (_ctx, { http }): AuthProvider => ({
    authenticate: (email, password) => http.post<Session>("/login", { email, password }),
  }),
})

export const session = atom({ factory: (): Session | null => null })

export const loginForm = atom({ factory: (): LoginFormState => ({ email: "", password: "", error: null }) })

function loginErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "login failed"
}

function loginValidationError(form: LoginFormState): string | null {
  if (!form.email.includes("@")) return "email must include @"
  if (form.password.length === 0) return "password is required"
  return null
}

export const updateLoginEmail = flow({
  name: "updateLoginEmail",
  parse: typed<string>(),
  deps: { formControl: controller(loginForm, { resolve: true }) },
  factory: (ctx, { formControl }) => {
    formControl.update((form) => ({ ...form, email: ctx.input }))
  },
})

export const updateLoginPassword = flow({
  name: "updateLoginPassword",
  parse: typed<string>(),
  deps: { formControl: controller(loginForm, { resolve: true }) },
  factory: (ctx, { formControl }) => {
    formControl.update((form) => ({ ...form, password: ctx.input }))
  },
})

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

export const submitLogin = flow({
  name: "submitLogin",
  parse: typed<undefined>(),
  deps: { formControl: controller(loginForm, { resolve: true }) },
  factory: async (ctx, { formControl }) => {
    const form = formControl.get()
    const validationError = loginValidationError(form)
    if (validationError !== null) {
      formControl.set({ ...form, error: validationError })
      throw new Error(validationError)
    }
    formControl.set({ ...form, error: null })
    try {
      return await ctx.exec({ flow: login, input: { email: form.email, password: form.password } })
    } catch (error) {
      formControl.update((current) => ({ ...current, error: loginErrorMessage(error) }))
      throw error
    }
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
