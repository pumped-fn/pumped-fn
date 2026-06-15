# F13 — Main bootstrap hides app state

Diagram: https://diashort.apps.quickable.co/d/bcc445ff

## The smell

`main.tsx` creates a React root and the first component immediately owns app state. Tests either skip the
bootstrap entirely or patch the DOM/root APIs, so the real provider boundary is never exercised.

## After

`main.tsx` is a small adapter: it creates one `scope`, renders the observer under `ScopeProvider`, and
disposes both the React root and scope on unmount. The app state remains in `after.ts`; the component in
`view.tsx` only observes and execs public graph flows.

## Lens

- **inside-out** (`after.test.ts`, node): bootstrap state and transitions are graph-owned.
- **outside-in** (`main.dom.test.tsx`, jsdom): production bootstrap mounts through the real
  `ScopeProvider` boundary and covers the missing-root adapter error.
