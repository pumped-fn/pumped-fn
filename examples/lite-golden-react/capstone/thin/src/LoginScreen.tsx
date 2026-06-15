import { useAtom, useExecutionContext } from "@pumped-fn/lite-react"
import { sessionToken } from "./session"
import { signInForm, submitSignIn, updateSignInEmail, updateSignInPassword } from "./signIn"
import { Dashboard } from "./Dashboard"

function ignoreFlowFailure(): void {}

export function LoginScreen() {
  const { data: token } = useAtom(sessionToken, { suspense: false, resolve: true })
  const { data: form } = useAtom(signInForm, { suspense: false, resolve: true })
  const ctx = useExecutionContext()

  if (token !== null && token !== undefined) {
    return <Dashboard />
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void ctx.exec({ flow: submitSignIn, input: undefined }).catch(ignoreFlowFailure)
      }}
    >
      <label>
        email
        <input
          aria-label="email"
          type="email"
          value={form?.email ?? ""}
          onChange={(e) => {
            void ctx.exec({ flow: updateSignInEmail, input: e.target.value }).catch(ignoreFlowFailure)
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
            void ctx.exec({ flow: updateSignInPassword, input: e.target.value }).catch(ignoreFlowFailure)
          }}
        />
      </label>
      {form?.error && <div role="alert">{form.error}</div>}
      <button type="submit">sign in</button>
    </form>
  )
}
