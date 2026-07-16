type ExecFnOptions = { fn: (ctx: ExecutionContext) => unknown }
type RunFnOptions = unknown
type RunDepsOptions = unknown
type ExecutionContext = { readonly input: unknown }
declare const ctx: { exec(options: unknown): Promise<unknown> }
declare const scope: { run(options: unknown): Promise<unknown> }
declare const client: { send(message: string): void }
declare const message: string
declare const importedCallback: () => string
const capturedCallback = () => client.send(message)

ctx.exec({
  fn: (_ctx) => client.send(message),
})

scope.run({
  name: "arguments",
  params: [ctx, scope],
  fn: () => "invalid",
})

ctx.exec({
  name: "captured-identifier",
  params: [],
  fn: capturedCallback,
})

ctx.exec({
  name: "uninspectable-identifier",
  params: [],
  fn: importedCallback,
})

ctx.exec({
  name: "captured-declaration",
  params: [],
  fn: capturedDeclaration,
})

function capturedDeclaration() {
  return client.send(message)
}
