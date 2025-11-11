import { describe, test, expect } from "vitest";
import { flow, extension } from "../src";

describe("flow.execute scope disposal", () => {
  test("disposes auto-created scope on handler rejection", async () => {
    let disposeCount = 0;
    const trackingExt = extension({
      name: "dispose-tracker",
      dispose: () => {
        disposeCount++;
      }
    });

    const failingFlow = flow(() => {
      throw new Error("test failure");
    });

    const result = flow.execute(failingFlow, undefined, {
      extensions: [trackingExt]
    });

    await expect(result.toPromise()).rejects.toThrow("test failure");
    expect(disposeCount).toBe(1);
  });
});
