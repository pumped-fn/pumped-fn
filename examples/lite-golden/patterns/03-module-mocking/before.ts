export interface ImportRequest {
  owner: string
  repo: string
}

export interface ImportTransport {
  post(path: string, body: ImportRequest): Promise<{ id: string }>
}

const transports = new Map<string, ImportTransport>()

const networkTransport: ImportTransport = {
  async post(path, body) {
    return { id: `${path}:${body.owner}/${body.repo}` }
  },
}

export function replaceTransportModule(path: string, transport: ImportTransport): void {
  transports.set(path, transport)
}

export function resetTransportModules(): void {
  transports.clear()
}

export async function importRepository(request: ImportRequest): Promise<string> {
  const transport = transports.get("../transport") ?? networkTransport
  const result = await transport.post("/catalog/import", request)

  return result.id
}

export async function pathKeyedReplacementSpec(): Promise<string[]> {
  const calls: string[] = []

  replaceTransportModule("../transport", {
    async post(path, body) {
      calls.push(`${path}:${body.repo}`)
      return { id: "runner-level-double" }
    },
  })

  const id = await importRepository({ owner: "acme", repo: "service" })

  return [id, ...calls]
}
