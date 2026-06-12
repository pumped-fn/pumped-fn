import type { Lite } from "@pumped-fn/lite"
import type { ClockPort } from "../src/ports"

export async function exec<O, I>(scope: Lite.Scope, flow: Lite.Flow<O, I>, input: NoInfer<I>): Promise<O> {
  const ctx = scope.createContext()
  try {
    const output = await ctx.exec({ flow, input } as Lite.ExecFlowOptions<O, I>)
    await ctx.close({ ok: true })
    await scope.flush()
    return output
  } catch (error) {
    await ctx.close({ ok: false, error })
    throw error
  }
}

type Timer = {
  ms: number
  next: number
  fn: () => unknown
}

export class FakeClock implements ClockPort {
  private readonly timers = new Map<number, Timer>()
  private nextId = 0
  private time = 0
  private created = 0
  private cancelled = 0

  now(): number {
    return this.time
  }

  every(ms: number, fn: () => unknown): () => void {
    const id = ++this.nextId
    this.created++
    this.timers.set(id, { ms, next: this.time + ms, fn })
    return () => {
      if (this.timers.delete(id)) this.cancelled++
    }
  }

  liveTimers(): number {
    return this.timers.size
  }

  createdTimers(): number {
    return this.created
  }

  cancelledTimers(): number {
    return this.cancelled
  }

  async advance(ms: number): Promise<void> {
    const end = this.time + ms
    while (this.hasDue(end)) {
      const next = this.nextDue()
      this.time = next
      for (const [id, timer] of [...this.timers]) {
        if (timer.next === next) {
          timer.next += timer.ms
          if (this.timers.has(id)) await timer.fn()
        }
      }
    }
    this.time = end
  }

  private hasDue(end: number): boolean {
    return [...this.timers.values()].some((timer) => timer.next <= end)
  }

  private nextDue(): number {
    return Math.min(...[...this.timers.values()].map((timer) => timer.next))
  }
}
