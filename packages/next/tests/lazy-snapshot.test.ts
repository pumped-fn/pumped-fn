import { describe, test, expect } from "vitest";
import { flow, flowMeta } from "../src";

describe("lazy snapshot creation", () => {
  test("defers contextData clone until snapshot accessed", async () => {
    let cloneCount = 0;
    const originalMapConstructor = Map;

    class TrackedMap<K, V> extends originalMapConstructor<K, V> {
      constructor(entries?: readonly (readonly [K, V])[] | null) {
        super(entries);
        if (entries && entries instanceof Map) {
          cloneCount++;
        }
      }
    }

    (global as any).Map = TrackedMap;

    try {
      const testFlow = flow((ctx) => {
        ctx.set(flowMeta.flowName, "test");
        return "result";
      });

      const result = flow.execute(testFlow, undefined, { details: true });

      await result;

      expect(cloneCount, "snapshot should not be created before ctx() called").toBe(0);

      const details = await result;
      const snapshot = details.ctx;

      expect(cloneCount, "snapshot should still not be created after details retrieved").toBe(0);

      snapshot.context.get(flowMeta.flowName);

      expect(cloneCount, "snapshot should be created when context.get() called").toBe(1);

      snapshot.context.get(flowMeta.flowName);

      expect(cloneCount, "snapshot should only be created once").toBe(1);
    } finally {
      (global as any).Map = originalMapConstructor;
    }
  });
});
