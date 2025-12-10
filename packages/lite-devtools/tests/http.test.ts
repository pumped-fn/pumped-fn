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
