import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { tagSymbol, type Tag } from "../src/tag-types";

describe("Tag System", () => {
  test("tag creates symbol-keyed accessor with schema", () => {
    const emailTag = tag(custom<string>());

    expect(emailTag.key).toBeInstanceOf(Symbol);
    expect(emailTag.schema).toBeDefined();
  });

  test("detects Store source type", () => {
    const store = new Map<symbol, unknown>();
    const emailTag = tag(custom<string>());

    store.set(emailTag.key, "test@example.com");
    expect(emailTag.find(store)).toBe("test@example.com");
  });

  test("detects Tagged array source type", () => {
    const emailTag = tag(custom<string>());
    const tagged: Tag.Tagged<string>[] = [
      {
        [tagSymbol]: true,
        key: emailTag.key,
        schema: emailTag.schema,
        value: "test@example.com",
      },
    ];

    expect(emailTag.find(tagged)).toBe("test@example.com");
  });

  test("detects Container source type", () => {
    const emailTag = tag(custom<string>());
    const container: Tag.Container = {
      tags: [
        {
          [tagSymbol]: true,
          key: emailTag.key,
          schema: emailTag.schema,
          value: "test@example.com",
        },
      ],
    };

    expect(emailTag.find(container)).toBe("test@example.com");
  });
});
