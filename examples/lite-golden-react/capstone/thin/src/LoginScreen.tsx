import type { Lite } from "@pumped-fn/lite"
import { useAtom, useScope } from "@pumped-fn/lite-react"
import { sessionToken } from "./session"
import { signInForm, submitSignIn, updateSignInEmail, updateSignInPassword } from "./signIn"
import { Dashboard } from "./Dashboard"

export function LoginScreen() {
  const { data: token } = useAtom(sessionToken, { suspense: false, resolve: true })
  const { data: form } = useAtom(signInForm, { suspense: false, resolve: true })
  const scope = useScope()

  const run = async (exec: (ctx: Lite.ExecutionContext) => Promise<unknown>) => {
    const ctx = scope.createContext()
    try {
      await exec(ctx)
      await ctx.close({ ok: true })
    } catch (error) {
      await ctx.close({ ok: false, error })
    }
  }

  if (token !== null && token !== undefined) {
    return <Dashboard />
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void run((ctx) => ctx.exec({ flow: submitSignIn, input: undefined }))
      }}
    >
      <label>
        email
        <input
          aria-label="email"
          type="email"
          value={form?.email ?? ""}
          onChange={(e) => {
            void run((ctx) => ctx.exec({ flow: updateSignInEmail, input: e.target.value }))
          }}
        />
      </label>
      <label>
        password
        <input
          aria-label="password"
          type="password"
          value={form?.password ?? ""}
          onChange={(e) => {
            void run((ctx) => ctx.exec({ flow: updateSignInPassword, input: e.target.value }))
          }}
        />
      </label>
      {form?.error && <div role="alert">{form.error}</div>}
      <button type="submit">sign in</button>
    </form>
  )
}
