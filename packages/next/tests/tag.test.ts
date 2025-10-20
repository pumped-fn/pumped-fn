import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { tagSymbol, type Tag } from "../src/tag-types";

describe("Tag System", () => {
  test("tag creates symbol-keyed accessor with schema", () => {
    const emailTag = tag(custom<string>());

    expect(typeof emailTag.key).toBe("symbol");
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

describe("Tag Creation and Retrieval", () => {
  test("tag without default requires value for get", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    expect(() => emailTag.get(store)).toThrow();
  });

  test("tag without default returns undefined for find", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    expect(emailTag.find(store)).toBeUndefined();
  });

  test("tag with default never throws on get", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const store = new Map<symbol, unknown>();

    expect(portTag.get(store)).toBe(3000);
  });

  test("tag with default returns default for find", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const store = new Map<symbol, unknown>();

    expect(portTag.find(store)).toBe(3000);
  });

  test("tag retrieves stored value", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    store.set(emailTag.key, "test@example.com");
    expect(emailTag.get(store)).toBe("test@example.com");
  });
});
