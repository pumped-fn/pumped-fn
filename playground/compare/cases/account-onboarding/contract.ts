export type ProvisionInput = {
  email: string
}

export type RequestFacts = {
  actorId: string
  requestId: string
}

export type User = {
  id: string
  email: string
  actorId: string
  requestId: string
  createdAt: string
}

export type DuplicateEmail = {
  kind: "duplicate-email"
  email: string
}

export type Outcome =
  | { ok: true; user: User }
  | { ok: false; error: DuplicateEmail }

export type Event =
  | "database.acquire"
  | "database.release"
  | "database.transaction.begin"
  | "database.transaction.commit"
  | "database.transaction.rollback"
  | "database.users.insert"
  | "database.users.duplicate"
  | "clock.now"
  | "uuid.next"

export type Database = {
  insertUser(user: User): Promise<"inserted" | "duplicate">
  close(): Promise<void>
}

export type Fixture = {
  events: Event[]
  openDatabase(): Promise<Database>
  now(): string
  nextId(): string
}

export type LaneRuntime = {
  provision(input: ProvisionInput, facts: RequestFacts): Promise<Outcome>
  close(): Promise<void>
}

export type Lane = {
  id: "pumped-fn" | "effect" | "awilix" | "inversify" | "plain"
  start(fixture: Fixture): LaneRuntime | Promise<LaneRuntime>
}
