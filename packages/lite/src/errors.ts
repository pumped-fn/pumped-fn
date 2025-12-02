export class ParseError extends Error {
  override readonly name = "ParseError"

  constructor(
    message: string,
    readonly phase: "tag" | "flow-input",
    readonly label: string,
    override readonly cause: unknown
  ) {
    super(message)
  }
}
