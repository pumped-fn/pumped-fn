import { describe, it, expect } from "vitest"
import { ParseError } from "../src/errors"

describe("ParseError", () => {
  it("preserves all properties for different phases", () => {
    const tagCause = new Error("Invalid UUID")
    const tagError = new ParseError('Failed to parse tag "userId"', "tag", "userId", tagCause)

    expect(tagError).toBeInstanceOf(Error)
    expect(tagError).toBeInstanceOf(ParseError)
    expect(tagError.name).toBe("ParseError")
    expect(tagError.message).toBe('Failed to parse tag "userId"')
    expect(tagError.phase).toBe("tag")
    expect(tagError.label).toBe("userId")
    expect(tagError.cause).toBe(tagCause)

    const flowError = new ParseError('Failed to parse "createUser"', "flow-input", "createUser", new Error())
    expect(flowError.phase).toBe("flow-input")
    expect(flowError.label).toBe("createUser")
  })
})
