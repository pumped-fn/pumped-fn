import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createAbortWithTimeout } from "../src/internal/abort-utils";

describe("createAbortWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates abort controller without timeout", () => {
    const result = createAbortWithTimeout();

    expect(result.controller).toBeInstanceOf(AbortController);
    expect(result.timeoutId).toBeNull();
    expect(result.controller.signal.aborted).toBe(false);
  });

  test("creates abort controller with timeout", () => {
    const result = createAbortWithTimeout(1000);

    expect(result.controller).toBeInstanceOf(AbortController);
    expect(result.timeoutId).not.toBeNull();
    expect(result.controller.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1000);

    expect(result.controller.signal.aborted).toBe(true);
    expect(result.controller.signal.reason).toBeInstanceOf(Error);
    expect(result.controller.signal.reason.message).toContain("timeout after 1000ms");
  });

  test("links to parent abort signal", () => {
    const parent = new AbortController();
    const result = createAbortWithTimeout(undefined, parent.signal);

    expect(result.controller.signal.aborted).toBe(false);

    parent.abort(new Error("parent aborted"));

    expect(result.controller.signal.aborted).toBe(true);
    expect(result.controller.signal.reason.message).toBe("parent aborted");
  });

  test("clears timeout when parent aborts", () => {
    const parent = new AbortController();
    const result = createAbortWithTimeout(1000, parent.signal);

    expect(result.timeoutId).not.toBeNull();

    parent.abort(new Error("parent aborted"));

    expect(result.controller.signal.aborted).toBe(true);
  });
});
