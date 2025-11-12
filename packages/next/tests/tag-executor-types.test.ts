import { describe, test, expect } from "vitest";
import { tagSymbol } from "../src/tag-types";
import type { Tag } from "../src/tag-types";

describe("TagExecutor Types", () => {
  test("TagExecutor has correct symbol values", () => {
    const mockTagExecutor: Tag.TagExecutor<string> = {
      [tagSymbol]: "required",
      tag: {} as any,
      extractionMode: "extract",
    };

    expect(mockTagExecutor[tagSymbol]).toBe("required");
    expect(mockTagExecutor.extractionMode).toBe("extract");
  });
});
