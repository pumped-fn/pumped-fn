import type { Lite } from "@pumped-fn/lite"
import { useAtom, useScope } from "@pumped-fn/lite-react"
import { isAuthed, loginForm, submitLogin, updateLoginEmail, updateLoginPassword, logout } from "./auth"

export function LoginForm() {
  const { data: authed } = useAtom(isAuthed, { suspense: false, resolve: true })
  const { data: form } = useAtom(loginForm, { suspense: false, resolve: true })
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

  if (authed) {
    return (
      <button
        onClick={() => {
          void run((ctx) => ctx.exec({ flow: logout, input: undefined }))
        }}
      >
        logout
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void run((ctx) => ctx.exec({ flow: submitLogin, input: undefined }))
      }}
    >
      <label>
        email
        <input
          aria-label="email"
          type="email"
          value={form?.email ?? ""}
          onChange={(e) => {
            void run((ctx) => ctx.exec({ flow: updateLoginEmail, input: e.target.value }))
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
            void run((ctx) => ctx.exec({ flow: updateLoginPassword, input: e.target.value }))
          }}
        />
      </label>
      {form?.error && <div role="alert">{form.error}</div>}
      <button type="submit">login</button>
    </form>
  )
}
