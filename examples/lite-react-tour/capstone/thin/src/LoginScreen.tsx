import { useAtom, useFlow } from "@pumped-fn/lite-react"
import { sessionToken } from "./session"
import { signInForm, submitSignIn, updateSignInEmail, updateSignInPassword } from "./signIn"
import { Dashboard } from "./Dashboard"

export function LoginScreen() {
  const { data: token } = useAtom(sessionToken, { suspense: false, resolve: true })
  const { data: form } = useAtom(signInForm, { suspense: false, resolve: true })
  const submit = useFlow(submitSignIn)
  const updateEmail = useFlow(updateSignInEmail)
  const updatePassword = useFlow(updateSignInPassword)

  if (token !== null && token !== undefined) {
    return <Dashboard />
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit.execute()
      }}
    >
      <label>
        email
        <input
          aria-label="email"
          type="email"
          value={form?.email ?? ""}
          onChange={(e) => {
            updateEmail.execute(e.target.value)
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
            updatePassword.execute(e.target.value)
          }}
        />
      </label>
      {form?.error && <div role="alert">{form.error}</div>}
      <button type="submit">sign in</button>
    </form>
  )
}
