# Capstone — Thin Frontend

## The story

The BFF owns authentication and view-model shaping. The frontend holds a token string and projects what the BFF returns. Credentials travel to the BFF; sessions, user models, and business rules never reach the browser graph.

## Seam

`createScope({ presets: [preset(bffClient, fake), preset(sessionToken, "tok")] })` is the complete test seam. No auth provider, no session object, no derived auth flag — none exist in this package.

## Lens coverage

- **inside-out**: signIn, dashboard logic tested in node (preset bffClient, preset sessionToken)
- **outside-in**: LoginScreen and Dashboard tested in jsdom via ScopeProvider + preset
- **effect-managed**: not applicable — no resources or long-lived effects in this graph; the token atom is the sole mutable state

## Contrast with fat

The fat frontend (`capstone/fat`) owns auth entirely: `authProvider` adapter, `session` atom (token + user object), `login`/`logout` flows, `isAuthed` derived atom — 6 logic units and 9 node-logic tests. The thin frontend has none of that: no `User`, no `Session`, no `isAuthed`, no `authProvider`. Those 6 units live in the BFF now. The thin frontend has 2 node-logic test files (signIn + dashboard) with 5 logic tests total, down from 9 in fat. The reduction IS the lesson.
