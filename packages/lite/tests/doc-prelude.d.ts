declare function createDatabase(): Promise<{ end(): void; query(sql: string): Promise<unknown[]> }>
declare function createServer(port?: number): { close(): Promise<void>; address(): string }
declare function createConnection(key: string): { close(): void }
declare function createDbPool(): { end(): void; query(sql: string): unknown }
declare function connectDb(url: string): { findUser(id: string): unknown }
declare function fetchConfig(): Promise<{ port: number }>
declare function fetchUser(id: string): Promise<{ id: string; name: string }>
declare function findUser(id: string): Promise<{ id: string; name: string }>

declare const loggingExt: import("../src/index").Lite.Extension
declare const loggingExtension: import("../src/index").Lite.Extension
declare const logging: import("../src/index").Lite.Extension

declare const mockDatabase: { query(sql: string): unknown; end(): void }
declare const inMemoryCache: unknown
declare const fakeDatabaseInstance: { query(sql: string): unknown; end(): void }
declare const testDb: { query(sql: string): unknown; end(): void }
declare const mockDb: { query(sql: string): unknown; end(): void }
declare const tenantOverrides: import("../src/index").Lite.Preset<unknown>[]

declare const value: unknown
declare const dep: unknown
declare const data: import("../src/index").Lite.ContextData

declare const scope: import("../src/index").Lite.Scope
declare const ctx: import("../src/index").Lite.ExecutionContext

declare const config: import("../src/index").Lite.Atom<{ port: number; connectionString?: string }>
declare const token: import("../src/index").Lite.Atom<{ jwt: string }>
declare const src: import("../src/index").Lite.Atom<{ name: string }>
declare const db: import("../src/index").Lite.Atom<{
  query(sql: string): unknown
  end(): void
  findUser(id: string): unknown
  updateUser(id: string, data: unknown): unknown
  beginTransaction(): {
    commit(): void
    rollback(): void
    release(): void
    insert(t: string, v: unknown): unknown
  }
}>
declare const cache: import("../src/index").Lite.Atom<unknown>
declare const process: import("../src/index").Lite.Flow<{ result: unknown }, { data: unknown }>
declare const processStub: import("../src/index").Lite.Flow<{ result: unknown }, { data: unknown }>
declare const handleRequest: import("../src/index").Lite.Flow<unknown, unknown>
declare const logService: import("../src/index").Lite.Atom<{
  child(opts: Record<string, unknown>): { flush(): void }
}>

declare const request: import("../src/index").Lite.Tag<unknown, false>
declare const req: { body: unknown }
declare const tenant: import("../src/index").Lite.Tag<string, false>
declare const tenantId: string
declare const name: import("../src/index").Lite.Tag<string, false>

declare type Extension = import("../src/index").Lite.Extension
