import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDevtools, memory } from "../src";
import { createScope, atom, flow } from "@pumped-fn/lite";
import type { Devtools } from "../src";

describe("createDevtools", () => {
  let events: Devtools.Event[];
  let transport: Devtools.MemoryTransport;

  beforeEach(() => {
    events = [];
    transport = memory();
    transport.subscribe((e) => events.push(...e));
  });

  afterEach(() => {
    transport.dispose?.();
  });

  it("captures atom resolution with timing", async () => {
    const testAtom = atom({
      factory: async function testAtom() {
        await new Promise((r) => setTimeout(r, 5));
        return 42;
      },
    });

    const scope = createScope({
      extensions: [createDevtools({ transports: [transport] })],
    });

    await scope.resolve(testAtom);
    await new Promise((r) => setTimeout(r, 10));

    expect(events.some((e) => e.type === "atom:resolve")).toBe(true);
    expect(events.some((e) => e.type === "atom:resolved" && e.duration! > 0)).toBe(true);
  });

  it("captures flow execution with input", async () => {
    const testFlow = flow({
      name: "testFlow",
      factory: (ctx) => ctx.input,
    });

    const scope = createScope({
      extensions: [createDevtools({ transports: [transport] })],
    });

    const ctx = scope.createContext();
    await ctx.exec({ flow: testFlow, input: { x: 1 } });
    await ctx.close();
    await new Promise((r) => setTimeout(r, 10));

    const execEvent = events.find((e) => e.type === "flow:exec");
    expect(execEvent?.input).toEqual({ x: 1 });
  });

  it("captures errors", async () => {
    const failingAtom = atom({
      factory: async function failingAtom(): Promise<never> {
        throw new Error("fail");
      },
    });

    const scope = createScope({
      extensions: [createDevtools({ transports: [transport] })],
    });

    await expect(scope.resolve(failingAtom)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 10));

    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("never blocks on transport failure", async () => {
    const badTransport: Devtools.Transport = {
      name: "bad",
      send: () => { throw new Error("transport fail"); },
    };

    const testAtom = atom({ factory: async () => 42 });
    const scope = createScope({
      extensions: [createDevtools({ transports: [badTransport] })],
    });

    const result = await scope.resolve(testAtom);
    expect(result).toBe(42);
  });
});
