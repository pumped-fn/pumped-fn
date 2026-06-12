import { createScope, preset } from "@pumped-fn/lite"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  lifecycleSink,
  payloadSink,
  poller,
  pulseEmitter,
  type PayloadListener,
  type PayloadSink,
  type PollerLifecycleSink,
  type PulseEmitter,
} from "./after"

afterEach(() => {
  vi.useRealTimers()
})

function createFakeEmitter(values: string[]): PulseEmitter {
  let listener: PayloadListener = () => {}
  return {
    emit: (payload) => {
      listener(payload)
    },
    next: () => values.shift() ?? "empty",
    off: (registered) => {
      expect(registered).toBe(listener)
      listener = () => {}
    },
    on: (registered) => {
      listener = registered
    },
  }
}

function createLifecycleSink(lifecycle: string[]): PollerLifecycleSink {
  return {
    record: (event) => {
      lifecycle.push(event)
    },
  }
}

describe("inside-out", () => {
  test("IO1: tick handler unit: preset the emitter/sink dep, advance fake time, assert processed payloads", async () => {
    vi.useFakeTimers()
    const processed: string[] = []
    const fakeEmitter = createFakeEmitter(["interval-1"])
    const sink: PayloadSink = {
      write: (payload) => {
        processed.push(payload)
      },
    }
    const scope = createScope({
      gc: { enabled: false },
      presets: [
        preset(pulseEmitter, fakeEmitter),
        preset(payloadSink, sink),
      ],
    })

    await scope.resolve(poller)
    fakeEmitter.emit("manual-1")
    vi.advanceTimersByTime(1000)

    expect(processed).toEqual(["manual-1", "interval-1"])
    await scope.dispose()
  })

  test("IO2: default emitter dispatches emit() to registered listeners until cleanup unhooks them", async () => {
    vi.useFakeTimers()
    const processed: string[] = []
    const scope = createScope({
      gc: { enabled: false },
      presets: [
        preset(payloadSink, {
          write: (payload) => {
            processed.push(payload)
          },
        }),
      ],
    })

    const emitter = await scope.resolve(pulseEmitter)
    await scope.resolve(poller)
    emitter.emit("bus-1")
    vi.advanceTimersByTime(1000)
    await scope.dispose()
    emitter.emit("bus-2")

    expect(processed).toEqual(["bus-1", "pulse-1"])
  })
})

describe("effect-managed", () => {
  test("E1: resolve -> ticks observed; dispose() -> advance time -> zero further ticks", async () => {
    vi.useFakeTimers()
    const processed: string[] = []
    const scope = createScope({
      gc: { enabled: false },
      presets: [
        preset(payloadSink, {
          write: (payload) => {
            processed.push(payload)
          },
        }),
      ],
    })

    await scope.resolve(poller)
    vi.advanceTimersByTime(1000)
    const beforeDispose = processed.length
    await scope.dispose()
    vi.advanceTimersByTime(3000)

    expect(beforeDispose).toBe(1)
    expect(processed.length).toBe(beforeDispose)
  })

  test("E2: release() -> cleanup ran; re-resolve -> exactly one active timer (no double-poller)", async () => {
    vi.useFakeTimers()
    const lifecycle: string[] = []
    const scope = createScope({
      gc: { enabled: false },
      presets: [preset(lifecycleSink, createLifecycleSink(lifecycle))],
    })

    await scope.resolve(poller)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    await scope.release(poller)
    expect(vi.getTimerCount()).toBe(0)
    await scope.resolve(poller)

    expect(vi.getTimerCount()).toBe(1)
    expect(lifecycle).toEqual(["start", "clear", "off", "start"])
    await scope.dispose()
  })

  test("E3: ctrl.invalidate() -> old timer cleared BEFORE new factory's timer starts (LIFO + lifecycle order) [S5]", async () => {
    vi.useFakeTimers()
    const lifecycle: string[] = []
    const scope = createScope({
      gc: { enabled: false },
      presets: [preset(lifecycleSink, createLifecycleSink(lifecycle))],
    })
    const ctrl = await scope.controller(poller, { resolve: true })

    ctrl.invalidate()
    await scope.flush()

    expect(lifecycle).toEqual(["start", "clear", "off", "start"])
    expect(vi.getTimerCount()).toBe(1)
    await scope.dispose()
  })

  test("E4: multiple cleanups in one factory run LIFO (order array)", async () => {
    vi.useFakeTimers()
    const lifecycle: string[] = []
    const scope = createScope({
      gc: { enabled: false },
      presets: [preset(lifecycleSink, createLifecycleSink(lifecycle))],
    })

    await scope.resolve(poller)
    await scope.release(poller)

    expect(lifecycle).toEqual(["start", "clear", "off"])
    await scope.dispose()
  })
})
