# Capstone — Thin Frontend

## The story

The BFF owns authentication and view-model shaping. The frontend holds a token string and projects what the BFF returns. Credentials travel to the BFF; sessions, user models, and business rules never reach the browser graph.

## Seam

`bffClient` is the raw adapter for login and explicit-token HTTP calls. It is the only thin declaration
that may call `fetch` inline. `authedBffClient` composes that adapter with `sessionToken`, so dashboard
feature tests preset one auth-capable port instead of coupling the feature atom to both raw transport and
token storage. No auth provider, no session object, no derived auth flag — none exist in this package.

## Lens coverage

- **inside-out**: signIn, dashboard logic, and `authedBffClient` token composition tested in node
- **outside-in**: LoginScreen and Dashboard tested in jsdom via ScopeProvider + ExecutionContextProvider +
  auth-capable port presets
- **effect-managed**: not applicable — no resources or long-lived effects in this graph; the token atom is the sole mutable state

## Contrast with fat

The fat frontend (`capstone/fat`) owns `authProvider`, `session`, `login`/`logout`, `isAuthed`, and
login form graph state. The thin frontend has none of that: no `User`, no `Session`, no `isAuthed`, no
`authProvider`. Those ownership rules live in the BFF now. The current file-derived node test inventory
is kept in `../README.md` so the comparison stays tied to actual test files instead of stale prose counts.
