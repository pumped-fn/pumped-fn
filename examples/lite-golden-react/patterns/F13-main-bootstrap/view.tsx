import { useAtom, useScope } from "@pumped-fn/lite-react"
import { bootCount, increment } from "./after"

export function CounterApp() {
  const { data: count } = useAtom(bootCount, { suspense: false, resolve: true })
  const scope = useScope()

  return (
    <button
      onClick={async () => {
        const ctx = scope.createContext()
        await ctx.exec({ flow: increment, input: undefined })
        await ctx.close({ ok: true })
      }}
    >
      count {count ?? 0}
    </button>
  )
}
