import { useAtom, useScope } from "@pumped-fn/lite-react"
import { bootCount, increment } from "./after"

export function CounterApp() {
  const { data: count } = useAtom(bootCount, { suspense: false, resolve: true })
  const scope = useScope()

  const runIncrement = async () => {
    const ctx = scope.createContext()
    try {
      await ctx.exec({ flow: increment, input: undefined })
      await ctx.close({ ok: true })
    } catch (error) {
      await ctx.close({ ok: false, error })
    }
  }

  return (
    <button
      onClick={() => {
        void runIncrement()
      }}
    >
      count {count ?? 0}
    </button>
  )
}
