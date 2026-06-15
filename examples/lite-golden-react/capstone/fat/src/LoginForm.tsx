import { useState } from "react"
import { useAtom, useScope } from "@pumped-fn/lite-react"
import { isAuthed, login, logout } from "./auth"

export function LoginForm() {
  const { data: authed } = useAtom(isAuthed, { suspense: false, resolve: true })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const scope = useScope()

  if (authed) {
    return (
      <button
        onClick={async () => {
          const ctx = scope.createContext()
          await ctx.exec({ flow: logout, input: undefined })
          await ctx.close({ ok: true })
        }}
      >
        logout
      </button>
    )
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          const ctx = scope.createContext()
          await ctx.exec({ flow: login, input: { email, password } })
          await ctx.close({ ok: true })
        } catch (err) {
          setError(err instanceof Error ? err.message : "login failed")
        }
      }}
    >
      <label>
        email
        <input aria-label="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        password
        <input
          aria-label="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <div role="alert">{error}</div>}
      <button type="submit">login</button>
    </form>
  )
}
