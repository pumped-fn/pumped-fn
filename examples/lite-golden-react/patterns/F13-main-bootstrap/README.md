# F13 — Main bootstrap hides app state

Diagram: https://diashort.apps.quickable.co/d/bcc445ff

## The smell

`main.tsx` creates a React root and the first component immediately owns app state. Tests either skip the
bootstrap entirely or patch DOM/root APIs, so the real provider boundary is never exercised.

## Harm

The graph seam disappears at the one place every user path enters the app. State can drift into React
bootstrap code, `ScopeProvider` wiring is assumed instead of tested, and disposal behavior is invisible.

## Transformation

Move state to `after.ts`, keep the component in `view.tsx` as an observer, and make `main.tsx` a small
composition-root adapter. It creates one `scope`, renders through `ScopeProvider` and
`ExecutionContextProvider`, returns the mounted app with the returned `scope`, and disposes both React root
and scope on unmount. `main.tsx` is also the only declaration in the pattern that may touch `document`;
observers and graph nodes stay ambient-free. The observer uses `useExecutionContext` to execute flows
through the provider instead of accepting `scope` or hand-rolling `createContext`/`close` helpers.

## Lens coverage

- **inside-out** (`after.test.ts`, node): bootstrap state and transitions are graph-owned.
- **outside-in** (`main.dom.test.tsx`, jsdom): production bootstrap mounts through the real
  `ScopeProvider`/`ExecutionContextProvider` boundary, asserts `bootCount` through the returned `scope`,
  and covers the missing-root adapter error.
- **effect-managed** (`main.dom.test.tsx`, jsdom): unmount owns root and scope disposal.

## Why 100%

The node test covers graph state without a DOM, and the DOM test covers the actual composition-root
adapter instead of replacing it. Nothing above the seam needs `vi.mock` or `vi.spyOn`; the returned
`scope` is the assertion surface.
