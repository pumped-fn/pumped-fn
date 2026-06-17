interface PoolConfig {
  readonly dsn: string
  readonly poolSize: number
}

class SharedSqlClient {
  readonly openedAt = Date.now()

  constructor(readonly config: PoolConfig) {}

  end(): void {}

  readAccount(id: string): string {
    return `${this.config.dsn}:${id}`
  }
}

const bootConfig: PoolConfig = {
  dsn: "db://shared-at-import",
  poolSize: 10,
}

const globalState = globalThis as typeof globalThis & {
  p01SharedClient?: SharedSqlClient
}

export const db = globalState.p01SharedClient ?? new SharedSqlClient(bootConfig)
globalState.p01SharedClient = db

export function loadAccount(id: string): string {
  return db.readAccount(id)
}
