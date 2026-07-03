# 01 - Import-Time Singleton
## Smell
A package module creates and exports a database client as soon as the module is imported, often with a process-level cache to avoid reconnecting during reloads.
## Harm
Importing any consumer initializes configuration and connection lifetime before a test can scope, replace, or close it.
## Provenance
- `dubinc/dub`, `packages/prisma/index.ts`, https://github.com/dubinc/dub/blob/eab1b8295da7ab259cc62f3b054ffd02417eb24b/packages/prisma/index.ts, MIT (`packages/prisma/package.json`): exports a process/global-cached Prisma client from package state.
- `documenso/documenso`, `packages/prisma/index.ts`, https://github.com/documenso/documenso/blob/b84b87cea6f1684249f985cb3b5fe9d4fd75820e/packages/prisma/index.ts, MIT (`packages/prisma/package.json`): keeps database clients and logging client state at module scope.
## Transformation
The client becomes the `db` atom, configuration enters through the `dbConfig` tag with `tags.required`, consumers depend on atoms, and tests substitute only `db` with `preset`. Config is plain data; the factory validates the dsn scheme, and tests prove the real factory never ran by counting scope `resolving` events, which preset-hit atoms never emit.
## Lens coverage
inside-out, outside-in, and effect-managed are all present.
## Why 100% is natural
`after.ts` has two real branches. The dsn scheme validation: a `db://` dsn constructs the client (IO1), a malformed dsn throws through `scope.resolve` and fires the failed event (IO3). The client's already-closed guard, a genuine driver invariant: dispose and release close the client exactly once (E1, E2), and calling `end()` on an already-closed client throws (E1). IO2/OI1 cover substitution without running the real factory, observed via zero `resolving` events.
