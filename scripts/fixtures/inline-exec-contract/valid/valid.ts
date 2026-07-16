declare const ctx: { exec(options: unknown): Promise<unknown> }
declare const scope: { run(options: unknown): Promise<unknown> }
declare const client: unknown
const operation = () => Promise.resolve("ok")

ctx.exec({
  name: "ctx-operation",
  deps: { client },
  params: [2],
  fn: ({ client }, value) => [client, value],
})

scope.run({
  name: "scope-operation",
  deps: {},
  params: [],
  fn: operation,
})

scope.run({
  name: "declared-operation",
  deps: {},
  params: [],
  fn: declaredOperation,
})

function declaredOperation() {
  return "declared"
}
