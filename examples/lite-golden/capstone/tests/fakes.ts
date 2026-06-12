import type { ClockPort } from "../src/ports"

type Timer = {
  ms: number
  next: number
  fn: () => void
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

  every(ms: number, fn: () => void): () => void {
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
          if (this.timers.has(id)) timer.fn()
        }
      }
      await this.drain()
    }
    this.time = end
    await this.drain()
  }

  private hasDue(end: number): boolean {
    return [...this.timers.values()].some((timer) => timer.next <= end)
  }

  private nextDue(): number {
    return Math.min(...[...this.timers.values()].map((timer) => timer.next))
  }

  private async drain(): Promise<void> {
    for (let i = 0; i < 50; i++) await Promise.resolve()
  }
}
