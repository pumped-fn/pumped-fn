import { describe, test, expect } from "vitest";
import { tag, type Tag, custom } from "../src";

describe("Tag Public API", () => {
  test("tag is exported from main entry", () => {
    const emailTag = tag(custom<string>());
    expect(emailTag).toBeDefined();
  });

  test("Tag types are exported", () => {
    const portTag: Tag.Tag<number, true> = tag(custom<number>(), {
      default: 3000,
    });
    expect(portTag.default).toBe(3000);
  });
});
