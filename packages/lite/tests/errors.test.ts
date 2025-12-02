import { describe, it, expect } from "vitest"
import { ParseError } from "../src/errors"

describe("ParseError", () => {
  it("creates error with tag phase", () => {
    const cause = new Error("Invalid UUID")
    const error = new ParseError(
      'Failed to parse tag "userId"',
      "tag",
      "userId",
      cause
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ParseError)
    expect(error.name).toBe("ParseError")
    expect(error.message).toBe('Failed to parse tag "userId"')
    expect(error.phase).toBe("tag")
    expect(error.label).toBe("userId")
    expect(error.cause).toBe(cause)
  })

  it("creates error with flow-input phase", () => {
    const cause = new Error("Expected string")
    const error = new ParseError(
      'Failed to parse flow input "createUser"',
      "flow-input",
      "createUser",
      cause
    )

    expect(error.phase).toBe("flow-input")
    expect(error.label).toBe("createUser")
  })
})
