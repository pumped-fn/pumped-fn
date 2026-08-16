import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"

export interface Directory {
  displayName(name: string): string
}

export const region = tag<string>({ label: "example.pumped-tour.region" })

export const directory = atom({
  factory: (): Directory => ({
    displayName: (name) => name.trim(),
  }),
})

export const greet = flow({
  parse: typed<{ name: string }>(),
  deps: {
    directory,
    region: tags.required(region),
  },
  factory: (context, { directory, region }) => ({
    message: `Hello, ${directory.displayName(context.input.name)} from ${region}`,
  }),
})
