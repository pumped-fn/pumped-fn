import { atom, flow, typed, controller } from "@pumped-fn/lite"
import { bffClient } from "./bff"
import { sessionToken } from "./session"

export interface SignInFormState {
  email: string
  password: string
  error: string | null
}

export const signInForm = atom({ factory: (): SignInFormState => ({ email: "", password: "", error: null }) })

function signInErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "login failed"
}

function signInValidationError(form: SignInFormState): string | null {
  if (!form.email.includes("@")) return "email must include @"
  if (form.password.length === 0) return "password is required"
  return null
}

export const updateSignInEmail = flow({
  name: "updateSignInEmail",
  parse: typed<string>(),
  deps: { formControl: controller(signInForm, { resolve: true }) },
  factory: (ctx, { formControl }) => {
    formControl.update((form) => ({ ...form, email: ctx.input }))
  },
})

export const updateSignInPassword = flow({
  name: "updateSignInPassword",
  parse: typed<string>(),
  deps: { formControl: controller(signInForm, { resolve: true }) },
  factory: (ctx, { formControl }) => {
    formControl.update((form) => ({ ...form, password: ctx.input }))
  },
})

export const signIn = flow({
  name: "sign-in",
  parse: typed<{ email: string; password: string }>(),
  deps: { client: bffClient, tokenControl: controller(sessionToken, { resolve: true }) },
  factory: async (ctx, { client, tokenControl }) => {
    const { token } = await client.login(ctx.input.email, ctx.input.password)
    tokenControl.set(token)
  },
})

export const submitSignIn = flow({
  name: "submitSignIn",
  parse: typed<undefined>(),
  deps: { formControl: controller(signInForm, { resolve: true }) },
  factory: async (ctx, { formControl }) => {
    const form = formControl.get()
    const validationError = signInValidationError(form)
    if (validationError !== null) {
      formControl.set({ ...form, error: validationError })
      throw new Error(validationError)
    }
    formControl.set({ ...form, error: null })
    try {
      await ctx.exec({ flow: signIn, input: { email: form.email, password: form.password } })
    } catch (error) {
      formControl.update((current) => ({ ...current, error: signInErrorMessage(error) }))
      throw error
    }
  },
})
