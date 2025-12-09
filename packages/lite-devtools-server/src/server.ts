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
