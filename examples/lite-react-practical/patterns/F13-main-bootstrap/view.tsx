import { useAtom, useExecutionContext } from "@pumped-fn/lite-react"
import { bootCount, increment } from "./after"

function ignoreFlowFailure(): void {}

export function CounterApp() {
  const { data: count } = useAtom(bootCount, { suspense: false, resolve: true })
  const ctx = useExecutionContext()

  return (
    <button
      onClick={() => {
        void ctx.exec({ flow: increment, input: undefined }).catch(ignoreFlowFailure)
      }}
    >
      count {count ?? 0}
    </button>
  )
}
