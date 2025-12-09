# HTTP Transport & Devtools Server Design

## Overview

Add HTTP transport for cross-process devtools communication:
1. **`@pumped-fn/lite-devtools`** — Add `httpTransport()` for fire-and-forget POST
2. **`@pumped-fn/lite-devtools-server`** — New standalone TUI dashboard package

## Architecture

```
┌─────────────────────┐         POST /events         ┌─────────────────────────┐
│   App Process       │ ─────────────────────────────▶│  Devtools Server (TUI)  │
│                     │                               │                         │
│  scope + devtools   │                               │  Hono + OpenTUI React   │
│  httpTransport()    │                               │  @pumped-fn/lite-react  │
└─────────────────────┘                               └─────────────────────────┘
```

## Part 1: HTTP Transport

Location: `packages/lite-devtools/src/transports/http.ts`

```typescript
interface HttpTransportOptions {
  readonly url: string;
  readonly headers?: Record<string, string>;
}

export function httpTransport(options: HttpTransportOptions): Devtools.Transport {
  return {
    name: "http",

    send(events) {
      try {
        fetch(options.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...options.headers },
          body: JSON.stringify(events),
        }).catch(() => {}); // fire-and-forget, silent drop
      } catch {}
    },
  };
}
```

Design decisions:
- Node.js `fetch` (available in Node 18+)
- Fire-and-forget: no await, silent error handling (matches existing transports)
- No retry logic, no queuing

## Part 2: Devtools Server Package

New package: `@pumped-fn/lite-devtools-server`

### Dependencies
- `@pumped-fn/lite` — state management
- `@pumped-fn/lite-react` — React bindings
- `@pumped-fn/lite-devtools` — event types
- `hono` + `@hono/node-server` — HTTP server
- `@opentui/core` + `@opentui/react` — Terminal UI

### Structure

```
packages/lite-devtools-server/
├── src/
│   ├── index.ts        # exports
│   ├── state.ts        # scope + eventsAtom
│   ├── server.ts       # Hono app
│   ├── ui.tsx          # OpenTUI React components
│   └── bin.ts          # CLI entry point
├── package.json
└── tsconfig.json
```

### State (`state.ts`)

```typescript
import { createScope, atom } from "@pumped-fn/lite";
import type { Devtools } from "@pumped-fn/lite-devtools";

export const eventsAtom = atom<Devtools.Event[]>(() => []);
export const scope = createScope();
```

### Server (`server.ts`)

```typescript
import { Hono } from "hono";
import { scope, eventsAtom } from "./state";

const app = new Hono();

app.post("/events", async (c) => {
  const ctx = scope.createContext();
  try {
    const newEvents = await c.req.json();
    const ctrl = scope.controller(eventsAtom);
    await ctrl.resolve();
    ctrl.update((prev) => [...prev, ...newEvents].slice(-100));
    return c.json({ ok: true });
  } finally {
    await ctx.close();
  }
});

export { app };
```

### UI (`ui.tsx`)

```typescript
import { ScopeProvider, useAtom } from "@pumped-fn/lite-react";
import { scope, eventsAtom } from "./state";

function EventList() {
  const events = useAtom(eventsAtom);
  return (
    <scrollbox>
      {events.map((e) => (
        <text key={e.id}>{formatEvent(e)}</text>
      ))}
    </scrollbox>
  );
}

function App() {
  return (
    <ScopeProvider scope={scope}>
      <box flexDirection="column">
        <text>Devtools Server</text>
        <EventList />
      </box>
    </ScopeProvider>
  );
}
```

### CLI Entry (`bin.ts`)

```typescript
import { serve } from "@hono/node-server";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { app } from "./server";
import { App } from "./ui";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Start HTTP server
serve({ fetch: app.fetch, port: PORT });

// Start TUI
const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
```

## Usage

### Sending events (app side)

```typescript
import { createScope } from "@pumped-fn/lite";
import { createDevtools, httpTransport } from "@pumped-fn/lite-devtools";

const scope = createScope({
  extensions: [
    createDevtools({
      transports: [httpTransport({ url: "http://localhost:3001/events" })]
    })
  ]
});
```

### Running the server

```bash
npx @pumped-fn/lite-devtools-server
# or
PORT=3002 npx @pumped-fn/lite-devtools-server
```

## Open Questions

None — design validated through brainstorming.
