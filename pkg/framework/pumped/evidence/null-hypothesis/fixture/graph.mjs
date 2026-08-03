import { app, atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/pumped/app"

export const region = tag({ label: "example.graph.region" })

export const directory = atom({
  factory: () => ({ displayName: (name) => name.trim() }),
})

export const connection = resource({
  name: "connection",
  factory: () => ({ suffix: "!" }),
})

export const format = flow({
  name: "format",
  parse: typed(),
  factory: (context) => context.input.trim(),
})

export const greet = flow({
  parse: typed(),
  deps: {
    connection,
    directory: controller(directory, { resolve: true }),
    region: tags.required(region),
  },
  factory: async (context, deps) => {
    const name = await context.exec({ flow: format, input: context.input.name })
    return `${deps.directory.get().displayName(name)}:${deps.region}${deps.connection.suffix}`
  },
})

export const nightly = atom({
  deps: { connection },
  factory: (_context, deps) => ({ cron: "0 0 * * *", suffix: deps.connection.suffix }),
})

export const runtimeEvents = []
const trace = {
  name: "graph-runtime-probe",
  wrapExec: async (next, target) => {
    runtimeEvents.push(target === greet ? "flow:greet" : target === format ? "flow:format" : "unknown:exec")
    return next()
  },
  wrapResolve: async (next, event) => {
    const value = event.target === directory
      ? "atom:directory"
      : event.target === connection
        ? "resource:connection"
        : `unknown:${event.kind}`
    runtimeEvents.push(value)
    return next()
  },
}

export const manifest = {
  app: app({ tags: [region("default")], extensions: [trace] }),
  entries: [
    { kind: "server", name: "greet", file: "src/server/greet.ts", flow: greet },
    { kind: "jobs", name: "nightly", file: "src/jobs/nightly.ts", schedule: nightly },
  ],
}
