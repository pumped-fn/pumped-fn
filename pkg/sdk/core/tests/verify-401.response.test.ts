import { expect, it } from "vitest"
import { ModelResponseParseError, parseModelResponse } from "../src/index"

it("parses a response whose own fields contain a nested content key", () => {
  const output = JSON.stringify({
    content: "outer answer",
    metadata: { content: "nested answer" },
    stop: true,
  })

  expect(parseModelResponse(output)).toEqual({ content: "outer answer", stop: true })
})

it("parses an embedded response whose fields contain a nested content key", () => {
  const output = `prefix ${JSON.stringify({
    content: "outer answer",
    metadata: { content: "nested answer" },
  })} suffix`

  expect(parseModelResponse(output)).toEqual({ content: "outer answer", stop: true })
})

it("accepts one embedded response with braces and escaped quotes in its content", () => {
  const response = {
    content: "one { brace } and an escaped quote: \" and slash: \\",
    stop: false,
  }

  expect(parseModelResponse(`before ${JSON.stringify(response)} after`)).toEqual(response)
})

it("rejects the same response object repeated twice", () => {
  const response = JSON.stringify({ content: "same", stop: true })

  expect(() => parseModelResponse(`${response}\n${response}`)).toThrow(ModelResponseParseError)
})

it("rejects two distinct sibling responses", () => {
  const example = JSON.stringify({ content: "EXAMPLE ONLY", toolCalls: [{ name: "inspect" }] })
  const real = JSON.stringify({ content: "REAL ANSWER", stop: true })

  expect(() => parseModelResponse(`Tool-call example: ${example}\nReal response: ${real}`))
    .toThrow(ModelResponseParseError)
})
