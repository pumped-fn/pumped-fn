import { app, atom, flow, tag, tags, typed } from "@pumped-fn/pumped/app"

export const region = tag({ label: "example.graph.region" })

export const directory = atom({
  factory: () => ({ displayName: (name) => name.trim() }),
})

export const greet = flow({
  parse: typed(),
  deps: {
    directory,
    region: tags.required(region),
  },
  factory: (context, deps) => `${deps.directory.displayName(context.input.name)}:${deps.region}`,
})

export const manifest = {
  app: app({ tags: [region("default")] }),
  entries: [{ kind: "server", name: "greet", file: "src/server/greet.ts", flow: greet }],
}
