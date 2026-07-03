import { createScope, preset } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider, useAtom, useFlow } from "@pumped-fn/lite-react"
import {
  actor,
  clock,
  type Role,
} from "@pumped-fn/parking-lot-shared"
import { useMemo, useRef } from "react"
import * as app from "./state"

const roleLabels: Role[] = ["manager", "operator", "user"]

export function ParkingLotRoot() {
  const clockRef = useRef("2026-07-01T08:00:00.000Z")
  const scope = useMemo(() => createScope({
    presets: [preset(clock, () => clockRef.current)],
  }), [])
  return (
    <ScopeProvider scope={scope}>
      <ParkingLotApp clock={clockRef} />
    </ScopeProvider>
  )
}

interface AppProps {
  clock: { current: string }
}

export function ParkingLotApp({ clock }: AppProps) {
  const state = useAtom(app.ui, { suspense: false, resolve: true })
  const value = state.data ?? app.initialUi
  const tags = useMemo(() => [
    actor({ id: `${value.role}-spa`, role: value.role }),
  ], [value.role])

  return (
    <ExecutionContextProvider tags={tags}>
      <ParkingLotScreen clock={clock} />
    </ExecutionContextProvider>
  )
}

interface ScreenProps {
  clock: { current: string }
}

function ParkingLotScreen({ clock }: ScreenProps) {
  const state = useAtom(app.ui, { suspense: false, resolve: true })
  const value = state.data ?? app.initialUi
  const selectRole = useFlow(app.selectRole)
  const configure = useFlow(app.configure)
  const book = useFlow(app.book)
  const checkIn = useFlow(app.checkIn)
  const exit = useFlow(app.exit)
  const pay = useFlow(app.pay)
  const read = useFlow(app.read)

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Parking Lot</h1>
          <p>{value.message}</p>
        </div>
        <nav aria-label="Role" className="tabs">
          {roleLabels.map((item) => (
            <button
              aria-pressed={value.role === item}
              className={value.role === item ? "tab active" : "tab"}
              key={item}
              onClick={() => selectRole.execute(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
      </header>
      <section className="grid">
        <div className="panel">
          <h2>Manager</h2>
          <button
            onClick={() => {
              clock.current = "2026-07-01T08:00:00.000Z"
              configure.execute()
            }}
            type="button"
          >
            Configure
          </button>
          <button
            onClick={() => read.execute()}
            type="button"
          >
            Report
          </button>
        </div>
        <div className="panel">
          <h2>User</h2>
          <button
            onClick={() => book.execute()}
            type="button"
          >
            Book
          </button>
        </div>
        <div className="panel">
          <h2>Operator</h2>
          <button
            onClick={() => {
              clock.current = "2026-07-01T09:00:00.000Z"
              checkIn.execute()
            }}
            type="button"
          >
            Check In
          </button>
          <button
            onClick={() => {
              clock.current = "2026-07-01T11:20:00.000Z"
              exit.execute()
            }}
            type="button"
          >
            Exit
          </button>
          <button
            onClick={() => pay.execute()}
            type="button"
          >
            Pair
          </button>
        </div>
      </section>
      <section className="metrics" aria-label="Metrics">
        <div>
          <span>Lot</span>
          <strong>{value.lotId || "-"}</strong>
        </div>
        <div>
          <span>Session</span>
          <strong>{value.sessionId || "-"}</strong>
        </div>
        <div>
          <span>Payment</span>
          <strong>{value.paymentId || "-"}</strong>
        </div>
        <div>
          <span>Revenue</span>
          <strong>{money(value.revenueCents)}</strong>
        </div>
      </section>
    </main>
  )
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
