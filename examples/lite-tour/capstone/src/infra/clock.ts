import { atom } from "@pumped-fn/lite"
import type { ClockPort } from "../ports"

export const clock = atom({
  factory: (ctx): ClockPort => {
    const handles = new Set<ReturnType<typeof setInterval>>()
    ctx.cleanup(() => {
      for (const handle of handles) clearInterval(handle)
      handles.clear()
    })
    return {
      now: () => Date.now(),
      every(ms, fn) {
        const handle = setInterval(fn, ms)
        handles.add(handle)
        return () => {
          clearInterval(handle)
          handles.delete(handle)
        }
      },
    }
  },
})
