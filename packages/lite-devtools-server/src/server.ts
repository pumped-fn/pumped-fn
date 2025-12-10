import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Devtools } from "@pumped-fn/lite-devtools";
import type { Lite } from "@pumped-fn/lite";
import { scope, eventsAtom } from "./state";

const MAX_EVENTS = 100;

export const app = new Hono();
app.use("*", cors());

let ctrl: Lite.Controller<Devtools.Event[]> | undefined;
function getController() {
  if (!ctrl) ctrl = scope.controller(eventsAtom);
  return ctrl;
}

app.post("/events", async (c) => {
  try {
    const newEvents = (await c.req.json()) as Devtools.Event[];
    getController().update((prev) => {
      const next = prev.concat(newEvents);
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 400);
  }
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/events", (c) => c.json(getController().get()));
