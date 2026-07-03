import { useAtom, useFlow } from "@pumped-fn/lite-react"
import { isAuthed, loginForm, submitLogin, updateLoginEmail, updateLoginPassword, logout } from "./auth"

export function LoginForm() {
  const { data: authed } = useAtom(isAuthed, { suspense: false, resolve: true })
  const { data: form } = useAtom(loginForm, { suspense: false, resolve: true })
  const runLogout = useFlow(logout)
  const submit = useFlow(submitLogin)
  const updateEmail = useFlow(updateLoginEmail)
  const updatePassword = useFlow(updateLoginPassword)

  if (authed) {
    return (
      <button
        onClick={() => {
          runLogout.execute()
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
      <button type="submit">login</button>
    </form>
  )
}
