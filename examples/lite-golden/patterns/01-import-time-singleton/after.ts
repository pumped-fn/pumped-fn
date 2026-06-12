import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"

export interface DbConfig {
  readonly dsn: string
  readonly poolSize: number
}

export interface DbClient {
  readonly closed: boolean
  readonly dsn: string
  readonly id: symbol
  readonly poolSize: number
  end(): void
  readAccount(id: string): string
}

export interface AccountRepo {
  readonly dsn: string
  read(id: string): string
}

export const dbConfig = tag<DbConfig>({ label: "p01.db.config" })

export const db = atom({
  deps: { config: tags.required(dbConfig) },
  factory: (ctx, { config }) => {
    if (!config.dsn.startsWith("db://")) {
      throw new Error(`Unsupported dsn scheme: ${config.dsn}`)
    }
    let closed = false
    const client: DbClient = {
      get closed() {
        return closed
      },
      dsn: config.dsn,
      id: Symbol(config.dsn),
      poolSize: config.poolSize,
      end: () => {
        if (closed) {
          throw new Error(`Client already closed: ${config.dsn}`)
        }
        closed = true
      },
      readAccount: (id) => `${config.dsn}:${id}`,
    }
    ctx.cleanup(client.end)
    return client
  },
})

export const accountRepo = atom({
  deps: { db },
  factory: (_, { db }): AccountRepo => ({
    dsn: db.dsn,
    read: (id) => db.readAccount(id),
  }),
})

export const accountSummary = atom({
  deps: { db },
  factory: (_, { db }) => db.readAccount("demo"),
})

export const accountLookup = flow({
  name: "p01.account-lookup",
  parse: typed<{ accountId: string }>(),
  deps: { repo: accountRepo },
  factory: (ctx, { repo }) => ({
    account: repo.read(ctx.input.accountId),
    dsn: repo.dsn,
  }),
})
