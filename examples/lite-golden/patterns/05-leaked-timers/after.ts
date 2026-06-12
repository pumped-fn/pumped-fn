import { atom } from "@pumped-fn/lite"

export type PayloadListener = (payload: string) => void

export interface PulseEmitter {
  emit(payload: string): void
  next(): string
  off(listener: PayloadListener): void
  on(listener: PayloadListener): void
}

export interface PayloadSink {
  write(payload: string): void
}

export interface PollerLifecycleSink {
  record(event: string): void
}

export interface PollerHandle {
  readonly active: true
}

export const pulseEmitter = atom({
  factory: (): PulseEmitter => {
    const listeners = new Set<PayloadListener>()
    let count = 0
    return {
      emit: (payload) => {
        for (const listener of listeners) {
          listener(payload)
        }
      },
      next: () => `pulse-${++count}`,
      off: (listener) => {
        listeners.delete(listener)
      },
      on: (listener) => {
        listeners.add(listener)
      },
    }
  },
})

export const payloadSink = atom({
  factory: (): PayloadSink => ({
    write: () => {},
  }),
})

export const lifecycleSink = atom({
  factory: (): PollerLifecycleSink => ({
    record: () => {},
  }),
})

export const poller = atom({
  deps: {
    emitter: pulseEmitter,
    lifecycle: lifecycleSink,
    sink: payloadSink,
  },
  factory: (ctx, { emitter, lifecycle, sink }): PollerHandle => {
    const listener: PayloadListener = (payload) => {
      sink.write(payload)
    }
    emitter.on(listener)
    const timer = setInterval(() => {
      sink.write(emitter.next())
    }, 1000)
    lifecycle.record("start")
    ctx.cleanup(() => {
      emitter.off(listener)
      lifecycle.record("off")
    })
    ctx.cleanup(() => {
      clearInterval(timer)
      lifecycle.record("clear")
    })
    return { active: true }
  },
})
