import { serve } from "@hono/node-server";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { ReactNode } from "react";
import { createElement } from "react";
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
    createRoot(renderer).render(createElement(App, { port: PORT }) as any);
  } catch {
    console.log("TUI not available, running headless");
  }
}

main().catch(console.error);
