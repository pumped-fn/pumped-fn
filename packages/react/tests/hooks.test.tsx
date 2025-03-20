import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { Suspense, act } from "react";
import { createScope, mutable, provide, resource } from "@pumped-fn/core";
import { ScopeProvider, useResolve, useResolveMany } from "../src/index";

describe("React Integration", () => {
  it("handles complex state management scenarios", async () => {
    const scope = createScope();
    const countExecutor = mutable(() => 0);
    const derivedResource = resource(countExecutor, (v) => [v, () => {}]);
    const derivedCount = provide([countExecutor], ([v]) => v + 2);
    const wholesum = provide([countExecutor, derivedCount], ([v1, v2]) => {
      return v1 + v2;
    });

    const updateCount = provide([countExecutor.ref], ([ref], scope) => {
      return (value: number) => scope.update(ref, value);
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
      result.current.update(4);
    });

    await waitFor(() => {
      expect(result.current.derived).toBe(6);
      expect(result.current.onlyMod3).toBe(true);
      expect(result.current.wholesumValue).toBe(10);
    });
  });
});
