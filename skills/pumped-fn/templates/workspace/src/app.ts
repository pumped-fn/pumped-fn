import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"

export const recipient = tag<string>({ label: "app.recipient", default: "world" })

export const salutation = atom({ factory: () => "hello" })

export const greet = flow({
  name: "greet",
  parse: typed<void>(),
  deps: { salutation, recipient: tags.required(recipient) },
  factory: (_ctx, { salutation, recipient }) => ({ text: `${salutation}, ${recipient}` }),
})
