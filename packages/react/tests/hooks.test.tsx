import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { Suspense, act } from "react";
import { createScope, derive, provide } from "@pumped-fn/core-next";
import { ScopeProvider, useResolve, useResolveMany } from "../src/index";

describe("React Integration", () => {
  it("handles complex state management scenarios", async () => {
    const scope = createScope();
    
    const countExecutor = provide(() => 0);
    const derivedResource = derive(
      countExecutor.reactive, 
      (count, controller) => {
        controller.cleanup(() => {
          console.log("Cleanup");
        });

        return count;
      }
    );
    const derivedCount = derive([countExecutor.reactive], ([v]) => v + 2);
    const wholesum = derive([countExecutor.reactive, derivedCount.reactive], ([v1, v2]) => {
      return v1 + v2;
    });

    const updateCount = derive([countExecutor.lazy], ([ref]) => {
      return ref.update
    });

    const fn = vi.fn();

    const { result } = renderHook(
      () => {
        fn();
        // Test multiple hooks working together
        const [derived, update, wholesumValue, derivedResourceValue] = useResolveMany(
          derivedCount,
          updateCount,
          wholesum,
          derivedResource,
        );
        const onlyMod3 = useResolve(derivedCount, (v) => v % 3 === 0);

        return { derived, update, wholesumValue, onlyMod3, derivedResourceValue };
      },
      {
        wrapper: ({ children }) => (
          <ScopeProvider scope={scope}>
            <Suspense>{children}</Suspense>
          </ScopeProvider>
        ),
      },
    );

    await waitFor(() => {
      expect(result.current.derived).toBe(2);
      expect(result.current.wholesumValue).toBe(2);
      expect(result.current.onlyMod3).toBe(false);
      expect(result.current.derivedResourceValue).toBe(0);
    });

    act(() => {
      scope.update(countExecutor, 4);
    });

    await waitFor(() => {
      expect(result.current.derived).toBe(6);
      expect(result.current.onlyMod3).toBe(true);
      expect(result.current.wholesumValue).toBe(10);
    });
  });
});
