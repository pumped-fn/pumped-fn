import { useAtom } from "@pumped-fn/lite-react"
import { isAuthed } from "./auth"
import { dashboard } from "./app"
import { LoginForm } from "./LoginForm"

export function DashboardScreen() {
  const { data: authed } = useAtom(isAuthed, { suspense: false, resolve: true })
  const { data: dash } = useAtom(dashboard, { suspense: false, resolve: true })

  if (!authed) return <LoginForm />

  if (dash === null || dash === undefined) return <div>loading</div>

  return (
    <div>
      <section aria-label="summary">
        <span>total {dash.summary.total}</span>
        <span>healthy {dash.summary.healthy}</span>
        <span>unhealthy {dash.summary.unhealthy}</span>
        <span>unknown {dash.summary.unknown}</span>
        <span>incidents {dash.summary.activeIncidents}</span>
      </section>
      <ul aria-label="attention">
        {dash.attention.map((row) => (
          <li key={row.id}>
            <span>{row.name}</span>
            <span>{row.status}</span>
            <span>{row.criticality}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
