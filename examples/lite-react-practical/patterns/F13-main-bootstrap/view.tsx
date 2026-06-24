import { useAtom, useFlow } from "@pumped-fn/lite-react"
import { bootCount, increment } from "./after"

export function CounterApp() {
  const { data: count } = useAtom(bootCount, { suspense: false, resolve: true })
  const runIncrement = useFlow(increment)

  return (
    <button
      onClick={() => {
        runIncrement.execute()
      }}
    >
      count {count ?? 0}
    </button>
  )
}
