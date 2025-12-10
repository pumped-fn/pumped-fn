# HTTP Transport & Devtools Server Implementation Plan

> **For Claude:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** HTTP transport for cross-process devtools + standalone TUI dashboard server.

**Architecture:** (1) `httpTransport()` in lite-devtools, (2) `@pumped-fn/lite-devtools-server` with Hono + OpenTUI.

---

## Task 1: HTTP Transport

**Files:**
- `packages/lite-devtools/src/transports/http.ts` (create)
- `packages/lite-devtools/src/transports/index.ts` (modify)
- `packages/lite-devtools/src/index.ts` (modify)
- `packages/lite-devtools/tests/http.test.ts` (create)

**Test** (`tests/http.test.ts`):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { httpTransport } from "../src";
import type { Devtools } from "../src";

function testEvent(): Devtools.Event {
  return { id: "1", type: "atom:resolved", timestamp: Date.now(), name: "test" };
}

describe("http transport", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("has correct name", () => {
    const transport = httpTransport({ url: "http://localhost:3001/events" });
    expect(transport.name).toBe("http");
  });

  it("sends events via POST", () => {
    const transport = httpTransport({ url: "http://localhost:3001/events" });
    transport.send([testEvent()]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });

  it("includes custom headers", () => {
    const transport = httpTransport({
      url: "http://localhost:3001/events",
      headers: { "X-Custom": "value" },
    });
    transport.send([testEvent()]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Custom": "value" }),
      })
    );
  });

  it("silently handles errors", () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fail"));
    const transport = httpTransport({ url: "http://localhost:3001/events" });
    expect(() => transport.send([testEvent()])).not.toThrow();
  });
});
```

**Implementation** (`src/transports/http.ts`):
```typescript
import type { Devtools } from "../types";

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
        }).catch(() => {});
      } catch {}
    },
  };
}
```

**Export** - add `httpTransport` to `transports/index.ts` and `src/index.ts`.

**Verify:** `pnpm --filter @pumped-fn/lite-devtools test && pnpm --filter @pumped-fn/lite-devtools typecheck`

**Commit:** `feat(lite-devtools): add httpTransport for cross-process events`

---

## Task 2: Server Package Scaffold

**Files:**
- `packages/lite-devtools-server/package.json`
- `packages/lite-devtools-server/tsconfig.json`
- `packages/lite-devtools-server/tsdown.config.ts`

**package.json:**
```json
{
  "name": "@pumped-fn/lite-devtools-server",
  "version": "0.0.1",
  "description": "Standalone TUI devtools server for @pumped-fn/lite",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.cts",
  "bin": { "lite-devtools-server": "./dist/bin.mjs" },
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "dev": "tsx src/bin.ts",
    "demo": "tsx examples/demo.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.8",
    "@opentui/core": "^0.0.26",
    "@opentui/react": "^0.0.26",
    "@pumped-fn/lite": "workspace:*",
    "@pumped-fn/lite-react": "workspace:*",
    "hono": "^4.7.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@pumped-fn/lite-devtools": "workspace:*",
    "@types/react": "^18.3.18",
    "tsdown": "^0.16.5",
    "tsx": "^4.19.4",
    "typescript": "^5.9.3"
  },
  "license": "MIT"
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**tsdown.config.ts:**
```typescript
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  dts: true,
  format: ["cjs", "esm"],
  clean: true,
});
```

**Run:** `pnpm install`

**Commit:** `chore(lite-devtools-server): add package scaffold`

---

## Task 3: Core Implementation

**Files:**
- `packages/lite-devtools-server/src/state.ts`
- `packages/lite-devtools-server/src/server.ts`
- `packages/lite-devtools-server/src/index.ts`

**state.ts:**
```typescript
import { createScope, atom } from "@pumped-fn/lite";
import type { Devtools } from "@pumped-fn/lite-devtools";

export const eventsAtom = atom<Devtools.Event[]>(() => []);
export const scope = createScope();
```

**server.ts:**
```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Devtools } from "@pumped-fn/lite-devtools";
import { scope, eventsAtom } from "./state";

export const app = new Hono();
app.use("*", cors());

app.post("/events", async (c) => {
  const ctx = scope.createContext();
  try {
    const newEvents = (await c.req.json()) as Devtools.Event[];
    const ctrl = scope.controller(eventsAtom);
    await ctrl.resolve();
    ctrl.update((prev) => [...prev, ...newEvents].slice(-100));
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 400);
  } finally {
    await ctx.close();
  }
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/events", async (c) => {
  const ctrl = scope.controller(eventsAtom);
  await ctrl.resolve();
  return c.json(ctrl.get());
});
```

**index.ts:**
```typescript
export { app } from "./server";
export { scope, eventsAtom } from "./state";
```

**Verify:** `pnpm --filter @pumped-fn/lite-devtools-server typecheck`

**Commit:** `feat(lite-devtools-server): add state and Hono server`

---

## Task 4: TUI + CLI

**Files:**
- `packages/lite-devtools-server/src/ui.tsx`
- `packages/lite-devtools-server/src/bin.ts`
- Update `src/index.ts`

**ui.tsx:**
```tsx
import { ScopeProvider, useAtom } from "@pumped-fn/lite-react";
import { Suspense } from "react";
import type { Devtools } from "@pumped-fn/lite-devtools";
import { scope, eventsAtom } from "./state";

const ICONS: Record<Devtools.EventType, string> = {
  "atom:resolve": "⚡", "atom:resolved": "✓", "flow:exec": "▶", "flow:complete": "✓", error: "✗",
};

function formatEvent(event: Devtools.Event): string {
  const time = new Date(event.timestamp).toISOString().slice(11, 23);
  const duration = event.duration ? ` (${event.duration.toFixed(1)}ms)` : "";
  return `[${time}] ${ICONS[event.type]} ${event.type.padEnd(14)} ${event.name}${duration}`;
}

function EventList() {
  const events = useAtom(eventsAtom);
  if (events.length === 0) return <text color="gray">Waiting for events...</text>;
  return (
    <box flexDirection="column">
      {events.slice(-20).map((e) => (
        <text key={e.id} color={e.type === "error" ? "red" : "white"}>{formatEvent(e)}</text>
      ))}
    </box>
  );
}

function StatusBar({ port }: { port: number }) {
  const events = useAtom(eventsAtom);
  return <text color="cyan">Port: {port} | Events: {events.length}</text>;
}

export function App({ port }: { port: number }) {
  return (
    <ScopeProvider scope={scope}>
      <box flexDirection="column" padding={1}>
        <text bold color="green">Lite Devtools Server</text>
        <box marginTop={1} flexDirection="column" flexGrow={1}>
          <Suspense fallback={<text>Loading...</text>}><EventList /></Suspense>
        </box>
        <box marginTop={1}>
          <Suspense fallback={<text>...</text>}><StatusBar port={port} /></Suspense>
        </box>
      </box>
    </ScopeProvider>
  );
}
```

**bin.ts:**
```typescript
import { serve } from "@hono/node-server";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { app } from "./server";
import { App } from "./ui";
import { scope, eventsAtom } from "./state";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

async function main() {
  await scope.ready;
  await scope.resolve(eventsAtom);
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`HTTP server listening on http://localhost:${info.port}`);
  });
  try {
    const renderer = await createCliRenderer();
    createRoot(renderer).render(<App port={PORT} />);
  } catch {
    console.log("TUI not available, running headless");
  }
}

main().catch(console.error);
```

**Update index.ts:** add `export { App } from "./ui";`

**Verify:** `pnpm --filter @pumped-fn/lite-devtools-server typecheck && pnpm --filter @pumped-fn/lite-devtools-server build`

**Commit:** `feat(lite-devtools-server): add TUI and CLI entry`

---

## Task 5: Demo + Final Verification

**Files:**
- `packages/lite-devtools-server/examples/demo.ts`

**demo.ts:**
```typescript
import { createScope, atom, flow } from "@pumped-fn/lite";
import { createDevtools, httpTransport } from "@pumped-fn/lite-devtools";

const scope = createScope({
  extensions: [createDevtools({ transports: [httpTransport({ url: "http://localhost:3001/events" })] })],
});

const userAtom = atom(async () => {
  await new Promise((r) => setTimeout(r, 100));
  return { id: 1, name: "Alice" };
});

const greetFlow = flow<string, { name: string }>((ctx) => `Hello, ${ctx.input.name}!`);

async function main() {
  const user = await scope.resolve(userAtom);
  const ctx = scope.createContext();
  await ctx.exec({ flow: greetFlow, input: { name: user.name } });
  await ctx.close();
  console.log("Events sent!");
  await new Promise((r) => setTimeout(r, 1000));
  await scope.dispose();
}

main().catch(console.error);
```

**Final verification:**
```bash
pnpm -r run build
pnpm -r run test
pnpm -r run typecheck
```

**Commit:** `feat(lite-devtools-server): add demo example`

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1 | `httpTransport()` with tests |
| 2 | Package scaffold |
| 3 | State + Hono server |
| 4 | TUI + CLI |
| 5 | Demo + verification |
