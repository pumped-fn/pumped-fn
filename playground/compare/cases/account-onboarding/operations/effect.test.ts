import { Context, type Exit, Tracer } from "effect"
import { describe, expect, it } from "vitest"
import { makeFixture } from "../fixture"
import { startEffect } from "../lanes/effect"
import { createTrace, type Trace } from "../trace"

function effectTracer(trace: Trace): Tracer.Tracer {
  let sequence = 0
  return Tracer.make({
    context: (run) => run(),
    span(name, parent, context, links, startTime, kind) {
      trace.record(name)
      sequence += 1
      let status: Tracer.SpanStatus = { _tag: "Started", startTime }
      const attributes = new Map<string, unknown>()
      return {
        _tag: "Span",
        name,
        spanId: `span-${sequence}`,
        traceId: "comparison-trace",
        parent,
        context: Context.empty(),
        get status() {
          return status
        },
        attributes,
        links,
        sampled: true,
        kind,
        end(endTime: bigint, exit: Exit.Exit<unknown, unknown>) {
          status = { _tag: "Ended", startTime, endTime, exit }
        },
        attribute(key, value) {
          attributes.set(key, value)
        },
        event() {},
        addLinks() {},
      }
    },
  })
}

describe("Effect operations", () => {
  it("records the explicit Effect span", async () => {
    const trace = createTrace()
    const runtime = startEffect(makeFixture(), effectTracer(trace))

    await runtime.provision({ email: "test@example.com" }, { actorId: "admin-test", requestId: "request-test" })
    await runtime.close()
    expect(trace.names).toContain("account.provision.effect")
  })
})
