# Invalid Guidance

Use `ctx.exec({ fn, name })` for a foreign call.

```ts
await ctx.exec({
  name: "client.send",
  params: [message],
  fn: (_ctx, input) => client.send(input),
})
```
