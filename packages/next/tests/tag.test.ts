import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";

describe("Tag System", () => {
  test("tag creates symbol-keyed accessor with schema", () => {
    const emailTag = tag(custom<string>());

    expect(emailTag.key).toBeInstanceOf(Symbol);
    expect(emailTag.schema).toBeDefined();
  });
});
