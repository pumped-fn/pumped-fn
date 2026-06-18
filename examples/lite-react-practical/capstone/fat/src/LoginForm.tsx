import { useAtom, useExecutionContext } from "@pumped-fn/lite-react"
import { isAuthed, loginForm, submitLogin, updateLoginEmail, updateLoginPassword, logout } from "./auth"

function ignoreFlowFailure(): void {}

export function LoginForm() {
  const { data: authed } = useAtom(isAuthed, { suspense: false, resolve: true })
  const { data: form } = useAtom(loginForm, { suspense: false, resolve: true })
  const ctx = useExecutionContext()

  if (authed) {
    return (
      <button
        onClick={() => {
          void ctx.exec({ flow: logout, input: undefined }).catch(ignoreFlowFailure)
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
        void ctx.exec({ flow: submitLogin, input: undefined }).catch(ignoreFlowFailure)
      }}
    >
      <label>
        email
        <input
          aria-label="email"
          type="email"
          value={form?.email ?? ""}
          onChange={(e) => {
            void ctx.exec({ flow: updateLoginEmail, input: e.target.value }).catch(ignoreFlowFailure)
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
            void ctx.exec({ flow: updateLoginPassword, input: e.target.value }).catch(ignoreFlowFailure)
          }}
        />
      </label>
      {form?.error && <div role="alert">{form.error}</div>}
      <button type="submit">login</button>
    </form>
  )
}
