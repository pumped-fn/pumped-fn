# BFF Capstone — FAT Frontend (v1)

## The story

The fat frontend owns auth. It holds credentials, authenticates against the auth endpoint, carries the session token, and gates every data load on that session. The BFF owns data shaping: it returns a `DashboardView` that is already summarized and sorted — the frontend projects it without recalculation.

This is one point on the logic-boundary spectrum: auth logic lives in frontend node tests; shaping logic lives in BFF node tests; observers live in jsdom tests.

## Seam

The scope is the single seam.

- `authProvider` and `bffClient` are raw adapter atoms. Their factories call `fetch`; no other declaration
  in the file may call ambient browser/runtime APIs inline. In adapter-own tests (`auth-provider.test.ts`,
  `bff-client.test.ts`), `vi.stubGlobal` fakes `fetch` below the seam — the sole sanctioned global-fake
  site per module.
- `authedBffClient` is the auth-capable port. It composes `bffClient` with `session`, so feature atoms never depend on both raw transport and session storage or pass `session.token` into service calls.
- `session` is preset directly only in tests that target auth gates such as `isAuthed`. Dashboard feature tests preset `authedBffClient`.
- Components observe atoms via `useAtom`/`useScope`; they exec flows on user interaction. The observer tests wrap components in `<ScopeProvider scope={scope}>` and interact via `fireEvent`.

## Lens coverage

| File | Inside-out | Outside-in | Effect-managed |
|---|---|---|---|
| `auth.ts` | `auth.test.ts` (login, isAuthed, logout, failure) | `LoginForm.dom.test.tsx` (full login→logout cycle) | absent — auth atoms own no cleanup resources |
| `app.ts` | `app.test.ts` (`authedBffClient` boundary, dashboard via auth-capable port) | `DashboardScreen.dom.test.tsx` (authed + data renders) | absent — dashboard atom is derived, no cleanup |
| `LoginForm.tsx` | — (logic in graph) | `LoginForm.dom.test.tsx` (all branches: login, logout, error, fallback) | — |
| `DashboardScreen.tsx` | — (logic in graph) | `DashboardScreen.dom.test.tsx` (unauthed, authed+data) | — |

Adapter-own tests (below the seam, faking `fetch`):
- `auth-provider.test.ts` — POST /login, ok parse, non-ok throw
- `bff-client.test.ts` — GET /dashboard with Bearer header, ok parse, non-ok throw
