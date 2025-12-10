import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../src/server";
import { scope, eventsAtom } from "../src/state";

describe("devtools server", () => {
  beforeEach(async () => {
    await scope.ready;
    await scope.resolve(eventsAtom);
    const ctrl = scope.controller(eventsAtom);
    ctrl.set([]);
  });

  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /events returns empty array initially", async () => {
    const res = await app.request("/events");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("POST /events stores events", async () => {
    const events = [{ id: "1", type: "atom:resolved", timestamp: Date.now(), name: "test" }];
    const res = await app.request("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const getRes = await app.request("/events");
    const stored = await getRes.json();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("1");
  });

  it("POST /events caps at 100 events", async () => {
    const events = Array.from({ length: 150 }, (_, i) => ({
      id: String(i),
      type: "atom:resolved",
      timestamp: Date.now(),
      name: `test-${i}`,
    }));

    await app.request("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events),
    });

    const res = await app.request("/events");
    const stored = await res.json();
    expect(stored).toHaveLength(100);
    expect(stored[0].id).toBe("50");
  });

  it("POST /events returns 400 for invalid JSON", async () => {
    const res = await app.request("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });
});
