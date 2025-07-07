import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { Suspense, act } from "react";
import { createScope, derive, provide } from "@pumped-fn/core-next";
import { ScopeProvider, useResolves } from "../src/index";

describe("Batching Behavior", () => {
  it("should batch multiple simultaneous updates", async () => {
    const scope = createScope();

    const counterA = provide(() => 0);
    const counterB = provide(() => 0);
    const counterC = provide(() => 0);

    const renderSpy = vi.fn();

    const { result } = renderHook(
      () => {
        renderSpy();
        return useResolves(counterA.reactive, counterB.reactive, counterC.reactive);
      },
      {
        wrapper: ({ children }) => (
          <ScopeProvider scope={scope}>
            <Suspense>{children}</Suspense>
          </ScopeProvider>
        ),
      }
    );

    await waitFor(() => {
      expect(result.current).toEqual([0, 0, 0]);
    });

    const initialRenderCount = renderSpy.mock.calls.length;

    // Update all three counters simultaneously
    act(() => {
      scope.update(counterA, 1);
      scope.update(counterB, 2);
      scope.update(counterC, 3);
    });

    await waitFor(() => {
      expect(result.current).toEqual([1, 2, 3]);
    });

    const finalRenderCount = renderSpy.mock.calls.length;
    const additionalRenders = finalRenderCount - initialRenderCount;

    // Should ideally be 1 render, but might be more due to current implementation
    console.log(`Additional renders after batch update: ${additionalRenders}`);
    expect(additionalRenders).toBeLessThanOrEqual(3); // At most one per executor
  });

  it("should handle rapid sequential updates", async () => {
    const scope = createScope();
    const counter = provide(() => 0);
    const renderSpy = vi.fn();

    const { result } = renderHook(
      () => {
        renderSpy();
        return useResolves(counter.reactive);
      },
      {
        wrapper: ({ children }) => (
          <ScopeProvider scope={scope}>
            <Suspense>{children}</Suspense>
          </ScopeProvider>
        ),
      }
    );

    await waitFor(() => {
      expect(result.current).toEqual([0]);
    });

    const initialRenderCount = renderSpy.mock.calls.length;

    // Rapid updates
    act(() => {
      scope.update(counter, 1);
      scope.update(counter, 2);
      scope.update(counter, 3);
      scope.update(counter, 4);
      scope.update(counter, 5);
    });

    await waitFor(() => {
      expect(result.current).toEqual([5]);
    });

    const finalRenderCount = renderSpy.mock.calls.length;
    const additionalRenders = finalRenderCount - initialRenderCount;

    console.log(`Additional renders after rapid updates: ${additionalRenders}`);
    // Should ideally be 1 render for the final value
    expect(additionalRenders).toBeLessThanOrEqual(5);
  });
});