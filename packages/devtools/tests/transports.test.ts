import { describe, it, expect } from "vitest";
import { memory, isMemoryTransport } from "../src";
import type { Devtools } from "../src";

function testEvent(): Devtools.Event {
  return { id: "1", type: "atom:resolved", timestamp: Date.now(), name: "test" };
}

describe("memory transport", () => {
  it("delivers events to subscribers", () => {
    const transport = memory();
    const received: Devtools.Event[] = [];
    transport.subscribe((e) => received.push(...e));

    transport.send([testEvent()]);

    expect(received).toHaveLength(1);
  });

  it("unsubscribe stops delivery", () => {
    const transport = memory();
    const received: Devtools.Event[] = [];
    const unsub = transport.subscribe((e) => received.push(...e));

    unsub();
    transport.send([testEvent()]);

    expect(received).toHaveLength(0);
  });

  it("isMemoryTransport works", () => {
    expect(isMemoryTransport(memory())).toBe(true);
    expect(isMemoryTransport({})).toBe(false);
  });
});
