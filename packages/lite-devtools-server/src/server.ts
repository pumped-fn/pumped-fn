import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Devtools } from "@pumped-fn/lite-devtools";
import { scope, eventsAtom } from "./state";

const MAX_EVENTS = 100;

export const app = new Hono();
app.use("*", cors());

const ctrl = scope.controller(eventsAtom);

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
