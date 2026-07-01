import { SpanStatusCode, type Attributes, type TimeInput } from "@opentelemetry/api"
import { describe, expect, it } from "vitest"
import { createScope, flow, typed } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel, type Otel } from "../src"

interface RecordedSpan {
  readonly name: string
  readonly startTime: TimeInput | undefined
  readonly initial: Attributes | undefined
  readonly attributes: Attributes[]
  readonly statuses: { readonly code: SpanStatusCode; readonly message?: string }[]
  readonly exceptions: Otel.Exception[]
  readonly ends: (TimeInput | undefined)[]
}

function recorder() {
  const spans: RecordedSpan[] = []
  const tracer: Otel.Tracer = {
    startSpan(name, options) {
      const record: RecordedSpan = {
        name,
        startTime: options?.startTime,
        initial: options?.attributes,
        attributes: [],
        statuses: [],
        exceptions: [],
        ends: [],
      }
      const span: Otel.Span = {
        setAttributes(attributes) {
          record.attributes.push(attributes)
          return span
        },
        setStatus(status) {
          record.statuses.push(status)
          return span
        },
        recordException(error) {
          record.exceptions.push(error)
        },
        end(endTime) {
          record.ends.push(endTime)
        },
      }
      spans.push(record)
      return span
    },
  }
  return { spans, tracer }
}

function clock(values: readonly number[]): () => number {
  let index = 0
  return () => values[index++] ?? values[values.length - 1]!
}

describe("otel sink", () => {
  it("maps observable lifecycle events to OpenTelemetry spans through runtime tags", async () => {
    const recorded = recorder()
    const sink = otel.sink({
      name: "otel-test",
      tracer: recorded.tracer,
      spanName: (event) => `${event.kind}:${event.name}`,
      attributes: (event) => ({ "app.phase": event.phase }),
    })
    const run = flow({
      name: "checkout",
      parse: typed<{ id: string }>(),
      factory: (ctx) => ({ accepted: ctx.input.id }),
    })
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [
        observable.runtime({
          sinks: [sink],
          input: true,
          output: true,
          now: clock([10, 16]),
          id: () => "exec-1",
        }),
      ],
    })

    await scope.createContext().exec({ flow: run, input: { id: "order-1" } })

    expect(sink.name).toBe("otel-test")
    expect(sink.pending()).toBe(0)
    expect(recorded.spans).toHaveLength(1)
    expect(recorded.spans[0]).toEqual({
      name: "flow:checkout",
      startTime: 10,
      initial: {
        "pumped.id": "exec-1",
        "pumped.kind": "flow",
        "pumped.phase": "start",
        "pumped.name": "checkout",
        "pumped.at": 10,
        "pumped.input": "{\"id\":\"order-1\"}",
        "app.phase": "start",
      },
      attributes: [
        {
          "pumped.id": "exec-1",
          "pumped.kind": "flow",
          "pumped.phase": "success",
          "pumped.name": "checkout",
          "pumped.at": 16,
          "pumped.started_at": 10,
          "pumped.duration_ms": 6,
          "pumped.output": "{\"accepted\":\"order-1\"}",
          "app.phase": "success",
        },
      ],
      statuses: [{ code: SpanStatusCode.OK }],
      exceptions: [],
      ends: [16],
    })
  })

  it("records errors and completes terminal events without a start event", () => {
    const recorded = recorder()
    let attributes = 0
    const sink = otel.sink({
      tracer: recorded.tracer,
      attributes: () => {
        attributes += 1
        return { extra: true }
      },
    })

    sink.emit({
      id: "late-ok",
      phase: "success",
      kind: "function",
      name: "late-ok",
      at: 15,
      output: false,
    })
    sink.emit({
      id: "late",
      phase: "error",
      kind: "flow",
      name: "late",
      at: 25,
      startedAt: 20,
      durationMs: 5,
      error: { name: "Boom", message: "failed", stack: "stack" },
    })
    sink.emit({
      id: "minimal",
      phase: "error",
      kind: "resource",
      name: "minimal",
      at: 30,
      error: { message: "minimal" },
    })
    sink.emit({
      id: "undefined",
      phase: "success",
      kind: "flow",
      name: "undefined",
      at: 35,
      output: undefined,
    })

    expect(recorded.spans).toHaveLength(4)
    expect(attributes).toBe(4)
    expect(recorded.spans[0]?.name).toBe("late-ok")
    expect(recorded.spans[0]?.startTime).toBe(15)
    expect(recorded.spans[0]?.initial?.["pumped.output"]).toBe(false)
    expect(recorded.spans[1]?.name).toBe("late")
    expect(recorded.spans[1]?.startTime).toBe(20)
    expect(recorded.spans[1]?.initial).toMatchObject({
      "pumped.error.message": "failed",
      "pumped.error.name": "Boom",
      "pumped.error.stack": "stack",
    })
    expect(recorded.spans[1]?.exceptions).toEqual([{ name: "Boom", message: "failed", stack: "stack" }])
    expect(recorded.spans[1]?.statuses).toEqual([{ code: SpanStatusCode.ERROR, message: "failed" }])
    expect(recorded.spans[1]?.ends).toEqual([25])
    expect(recorded.spans[2]?.initial).not.toHaveProperty("pumped.error.name")
    expect(recorded.spans[2]?.initial).not.toHaveProperty("pumped.error.stack")
    expect(recorded.spans[3]?.initial).not.toHaveProperty("pumped.output")
  })

  it("ends duplicate starts and pending spans without leaking", () => {
    const recorded = recorder()
    const sink = otel.sink({ tracer: recorded.tracer })

    sink.emit({ id: "dup", phase: "start", kind: "flow", name: "first", at: 1, input: "raw" })
    sink.emit({ id: "dup", phase: "start", kind: "flow", name: "second", at: 2 })
    expect(sink.pending()).toBe(1)
    sink.close?.()

    expect(recorded.spans).toHaveLength(2)
    expect(recorded.spans[0]?.initial?.["pumped.input"]).toBe("raw")
    expect(recorded.spans[0]?.ends).toEqual([2])
    expect(recorded.spans[1]?.ends).toEqual([undefined])
    expect(sink.pending()).toBe(0)
  })

  it("uses the default OpenTelemetry tracer when no tracer is passed", () => {
    const sink = otel.sink()

    sink.emit({ id: "default", phase: "start", kind: "flow", name: "default", at: 1 })
    expect(sink.name).toBe("otel")
    expect(sink.pending()).toBe(1)
    sink.close?.()
    expect(sink.pending()).toBe(0)
  })
})
