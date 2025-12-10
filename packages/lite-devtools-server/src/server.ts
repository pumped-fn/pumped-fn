import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Devtools } from "@pumped-fn/lite-devtools";
import type { Lite } from "@pumped-fn/lite";

const MAX_EVENTS = 100;

export function createApp(ctrl: Lite.Controller<Devtools.Event[]>) {
  const app = new Hono();
  app.use("*", cors());

  app.post("/events", async (c) => {
    try {
      const newEvents = (await c.req.json()) as Devtools.Event[];
      ctrl.update((prev) => {
        const next = prev.concat(newEvents);
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      });
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 400);
    }
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/events", (c) => c.json(ctrl.get()));

  return app;
}
