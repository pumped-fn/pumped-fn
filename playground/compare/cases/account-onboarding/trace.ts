export type Trace = {
  readonly names: readonly string[]
  record(name: string): void
  span<Output>(name: string, run: () => Promise<Output>): Promise<Output>
}

export const createTrace = (): Trace => {
  const names: string[] = []
  return {
    names,
    record(name) {
      names.push(name)
    },
    async span(name, run) {
      names.push(name)
      return run()
    },
  }
}

export const silentTrace: Trace = {
  names: [],
  record() {},
  span: (_name, run) => run(),
}
