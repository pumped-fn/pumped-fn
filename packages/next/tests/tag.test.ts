import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { createScope } from "../src/scope";
import { tags, isTag, isTagExecutor } from "../src/tag-executors";
import { provide, derive } from "../src/executor";
import { tagSymbol, type Tag } from "../src/tag-types";
import { inspect } from "node:util";

describe("Tag System", () => {
  describe("Tag Creation", () => {
    test("creates tag with label", () => {
      const emailTag = tag(custom<string>(), { label: "email" });

      expect(typeof emailTag.key).toBe("symbol");
      expect(emailTag.label).toBe("email");
      expect(emailTag.schema).toBeDefined();
      expect(emailTag.toString()).toBe("Tag(email)");
    });

    test("creates tag without label (anonymous)", () => {
      const anonTag = tag(custom<string>());

      expect(typeof anonTag.key).toBe("symbol");
      expect(anonTag.label).toBeUndefined();
      expect(anonTag.toString()).toContain("Tag(");
    });

    test("creates tag with default value", () => {
      const portTag = tag(custom<number>(), { label: "port", default: 3000 });

      expect(portTag.default).toBe(3000);
    });

    test("callable creates Tagged value", () => {
      const emailTag = tag(custom<string>(), { label: "email" });
      const tagged = emailTag("test@example.com");

      expect(tagged.key).toBe(emailTag.key);
      expect(tagged.value).toBe("test@example.com");
      expect(tagged[tagSymbol]).toBe(true);
      expect(tagged.toString()).toBe("email=\"test@example.com\"");
    });

    test("callable with default can omit value", () => {
      const portTag = tag(custom<number>(), { default: 3000 });
      const tagged = portTag();

      expect(tagged.value).toBe(3000);
    });

    test("callable with default can override default", () => {
      const portTag = tag(custom<number>(), { default: 3000 });
      const tagged = portTag(8080);

      expect(tagged.value).toBe(8080);
    });

    test("callable without default throws when called without value", () => {
      const emailTag = tag(custom<string>()) as unknown as Tag.Tag<string, true>;

      expect(() => emailTag()).toThrow("Value required");
    });

    test("entry creates symbol-value tuple", () => {
      const emailTag = tag(custom<string>(), { label: "email" });
      const [key, value] = emailTag.entry("test@example.com");

      expect(key).toBe(emailTag.key);
      expect(value).toBe("test@example.com");
    });

    test("entry with default can omit value", () => {
      const portTag = tag(custom<number>(), { default: 3000 });
      const [key, value] = portTag.entry();

      expect(key).toBe(portTag.key);
      expect(value).toBe(3000);
    });

    test("entry without default throws when called without value", () => {
      const emailTag = tag(custom<string>()) as unknown as Tag.Tag<string, true>;

      expect(() => emailTag.entry()).toThrow();
    });

    test("entry can initialize Map", () => {
      const portTag = tag(custom<number>(), { default: 3000 });
      const store = new Map([portTag.entry()]);

      expect(portTag.extractFrom(store)).toBe(3000);
    });

    test("Symbol.toStringTag shows label", () => {
      const portTag = tag(custom<number>(), { label: "port" });

      expect(portTag[Symbol.toStringTag]).toBe("Tag<port>");
    });

    test("Tagged value inspect shows formatted output", () => {
      const portTag = tag(custom<number>(), { label: "port" });
      const tagged = portTag(8080);
      const output = inspect(tagged);

      expect(output).toContain("port");
      expect(output).toContain("8080");
    });
  });

  describe("extractFrom", () => {
    describe("without default", () => {
      test.each([
        {
          source: "Map",
          createEmpty: () => new Map<symbol, unknown>(),
          createWithValue: (tag: Tag.Tag<string>, value: string) => {
            const map = new Map<symbol, unknown>();
            map.set(tag.key, value);
            return map;
          },
        },
        {
          source: "Array",
          createEmpty: () => [] as Tag.Tagged<string>[],
          createWithValue: (tag: Tag.Tag<string>, value: string) => [tag(value)],
        },
        {
          source: "Scope",
          createEmpty: () => createScope({ tags: [] }),
          createWithValue: (tag: Tag.Tag<string>, value: string) =>
            createScope({ tags: [tag(value)] }),
        },
      ])("$source - throws when value missing", ({ createEmpty }) => {
        const testTag = tag(custom<string>(), { label: "test" });
        const source = createEmpty();

        expect(() => testTag.extractFrom(source), "should throw for missing value").toThrow(
          "Value not found for key:"
        );
      });

      test.each([
        {
          source: "Map",
          createWithValue: (tag: Tag.Tag<string>, value: string) => {
            const map = new Map<symbol, unknown>();
            map.set(tag.key, value);
            return map;
          },
        },
        {
          source: "Array",
          createWithValue: (tag: Tag.Tag<string>, value: string) => [tag(value)],
        },
        {
          source: "Scope",
          createWithValue: (tag: Tag.Tag<string>, value: string) =>
            createScope({ tags: [tag(value)] }),
        },
      ])("$source - returns value when present", ({ createWithValue }) => {
        const testTag = tag(custom<string>(), { label: "test" });
        const source = createWithValue(testTag, "test-value");

        const result = testTag.extractFrom(source);

        expect(result, "should return actual value").toBe("test-value");
      });
    });

    describe("with default", () => {
      test.each([
        {
          source: "Map",
          createEmpty: () => new Map<symbol, unknown>(),
        },
        {
          source: "Array",
          createEmpty: () => [] as Tag.Tagged<number>[],
        },
        {
          source: "Scope",
          createEmpty: () => createScope({ tags: [] }),
        },
      ])("$source - returns default when missing", ({ createEmpty }) => {
        const testTag = tag(custom<number>(), { label: "test", default: 42 });
        const source = createEmpty();

        const result = testTag.extractFrom(source);

        expect(result, "should return default value").toBe(42);
      });

      test.each([
        {
          source: "Map",
          createWithValue: (tag: Tag.Tag<number, boolean>, value: number) => {
            const map = new Map<symbol, unknown>();
            map.set(tag.key, value);
            return map;
          },
        },
        {
          source: "Array",
          createWithValue: (tag: Tag.Tag<number, boolean>, value: number) => [tag(value)],
        },
        {
          source: "Scope",
          createWithValue: (tag: Tag.Tag<number, boolean>, value: number) =>
            createScope({ tags: [tag(value)] }),
        },
      ])("$source - returns actual value over default", ({ createWithValue }) => {
        const testTag = tag(custom<number>(), { label: "test", default: 42 });
        const source = createWithValue(testTag, 100);

        const result = testTag.extractFrom(source);

        expect(result, "should return actual value, not default").toBe(100);
      });
    });
  });

  describe("readFrom", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("collectFrom", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("injectTo", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("Tag Executors", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("Derive Integration", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });
});
