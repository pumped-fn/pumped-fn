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
      ])("$source - returns undefined when missing", ({ createEmpty }) => {
        const testTag = tag(custom<string>(), { label: "test" });
        const source = createEmpty();

        const result = testTag.readFrom(source);

        expect(result, "should return undefined for missing value").toBeUndefined();
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

        const result = testTag.readFrom(source);

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

        const result = testTag.readFrom(source);

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

        const result = testTag.readFrom(source);

        expect(result, "should return actual value, not default").toBe(100);
      });
    });
  });

  describe("collectFrom", () => {
    test.each([
      {
        source: "Map",
        createEmpty: () => new Map<symbol, unknown>(),
      },
      {
        source: "Array",
        createEmpty: () => [] as Tag.Tagged<string>[],
      },
      {
        source: "Scope",
        createEmpty: () => createScope({ tags: [] }),
      },
    ])("$source - returns empty array when no match", ({ createEmpty }) => {
      const testTag = tag(custom<string>(), { label: "test" });
      const source = createEmpty();

      const result = testTag.collectFrom(source);

      expect(result, "should return empty array").toEqual([]);
    });

    test("Map - returns single value in array", () => {
      const testTag = tag(custom<string>(), { label: "test" });
      const store = new Map<symbol, unknown>();
      store.set(testTag.key, "value");

      const result = testTag.collectFrom(store);

      expect(result, "Map should return single value").toEqual(["value"]);
    });

    test("Array - returns all matching values", () => {
      const testTag = tag(custom<string>(), { label: "test" });
      const tags: Tag.Tagged<string>[] = [
        testTag("value1"),
        testTag("value2"),
        testTag("value3"),
      ];

      const result = testTag.collectFrom(tags);

      expect(result, "should collect all matching values").toEqual([
        "value1",
        "value2",
        "value3",
      ]);
    });

    test("Array - filters by key in mixed array", () => {
      const emailTag = tag(custom<string>(), { label: "email" });
      const nameTag = tag(custom<string>(), { label: "name" });
      const tags: Tag.Tagged[] = [
        emailTag("test@example.com"),
        nameTag("John"),
        emailTag("another@example.com"),
      ];

      const result = emailTag.collectFrom(tags);

      expect(result, "should filter by tag key").toEqual([
        "test@example.com",
        "another@example.com",
      ]);
    });

    test("Scope - returns all matching values", () => {
      const permTag = tag(custom<string>(), { label: "permission" });
      const scope = createScope({
        tags: [permTag("read"), permTag("write"), permTag("delete")],
      });

      const result = permTag.collectFrom(scope);

      expect(result, "should collect all from scope").toEqual([
        "read",
        "write",
        "delete",
      ]);
    });
  });

  describe("injectTo", () => {
    test("mutates Map (Tag.Store)", () => {
      const emailTag = tag(custom<string>(), { label: "email" });
      const store = new Map<symbol, unknown>();

      emailTag.injectTo(store, "test@example.com");

      expect(store.has(emailTag.key), "should set value in store").toBe(true);
      expect(emailTag.extractFrom(store), "should be retrievable").toBe("test@example.com");
    });

    test("validates value via schema", () => {
      const numberTag = tag(
        {
          "~standard": {
            vendor: "test",
            version: 1,
            validate(value) {
              if (typeof value !== "number") {
                return { success: false, issues: [{ message: "Expected number" }] };
              }
              return { success: true, value };
            },
          },
        },
        { label: "validated-number" }
      );
      const store = new Map<symbol, unknown>();

      expect(
        () => numberTag.injectTo(store, "invalid" as unknown as number),
        "should throw on schema validation failure"
      ).toThrow();
    });

    test("overwrites existing value", () => {
      const portTag = tag(custom<number>(), { label: "port" });
      const store = new Map<symbol, unknown>();

      portTag.injectTo(store, 3000);
      expect(portTag.extractFrom(store)).toBe(3000);

      portTag.injectTo(store, 8080);
      expect(portTag.extractFrom(store), "should overwrite previous value").toBe(8080);
    });
  });

  describe("Tag Executors", () => {
    describe("tags.required", () => {
      test("creates TagExecutor with extract mode", () => {
        const userIdTag = tag(custom<string>(), { label: "userId" });
        const tagExec = tags.required(userIdTag);

        expect(tagExec[tagSymbol], "should have required marker").toBe("required");
        expect(tagExec.tag, "should reference original tag").toBe(userIdTag);
        expect(tagExec.extractionMode, "should use extract mode").toBe("extract");
      });
    });

    describe("tags.optional", () => {
      test("creates TagExecutor with read mode", () => {
        const roleTag = tag(custom<string>(), { label: "role" });
        const tagExec = tags.optional(roleTag);

        expect(tagExec[tagSymbol], "should have optional marker").toBe("optional");
        expect(tagExec.tag, "should reference original tag").toBe(roleTag);
        expect(tagExec.extractionMode, "should use read mode").toBe("read");
      });
    });

    describe("tags.all", () => {
      test("creates TagExecutor with collect mode", () => {
        const permTag = tag(custom<string>(), { label: "permission" });
        const tagExec = tags.all(permTag);

        expect(tagExec[tagSymbol], "should have all marker").toBe("all");
        expect(tagExec.tag, "should reference original tag").toBe(permTag);
        expect(tagExec.extractionMode, "should use collect mode").toBe("collect");
      });
    });

    describe("Type Guards", () => {
      test("isTag detects raw tags", () => {
        const userIdTag = tag(custom<string>());

        expect(isTag(userIdTag), "should detect tag").toBe(true);
        expect(isTag({}), "should reject plain object").toBe(false);
        expect(isTag(null), "should reject null").toBe(false);
      });

      test("isTagExecutor detects tag executors", () => {
        const userIdTag = tag(custom<string>());
        const tagExec = tags.required(userIdTag);

        expect(isTagExecutor(tagExec), "should detect tag executor").toBe(true);
        expect(isTagExecutor(userIdTag), "should reject raw tag").toBe(false);
        expect(isTagExecutor({}), "should reject plain object").toBe(false);
      });
    });
  });

  describe("Derive Integration", () => {
    test("derive resolves raw tag in array dependencies", async () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const scope = createScope({ tags: [userIdTag("user123")] });

      const executor = derive([userIdTag], ([userId]) => {
        return `Hello ${userId}`;
      });

      const result = await scope.resolve(executor);

      expect(result, "should resolve raw tag in array deps").toBe("Hello user123");
    });

    test("derive resolves tag executor in array dependencies", async () => {
      const permTag = tag(custom<string>(), { label: "permission" });
      const scope = createScope({
        tags: [permTag("read"), permTag("write")],
      });

      const executor = derive([tags.all(permTag)], ([permissions]) => {
        return permissions.join(",");
      });

      const result = await scope.resolve(executor);

      expect(result, "should resolve tag executor (tags.all)").toBe("read,write");
    });

    test("derive resolves multiple tags in array", async () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const roleTag = tag(custom<string>(), { label: "role", default: "user" });
      const scope = createScope({ tags: [userIdTag("123")] });

      const executor = derive([userIdTag, roleTag], ([userId, role]) => {
        return { userId, role };
      });

      const result = await scope.resolve(executor);

      expect(result, "should resolve multiple tags").toEqual({ userId: "123", role: "user" });
    });

    test("derive resolves object dependencies", async () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const roleTag = tag(custom<string>(), { label: "role" });
      const scope = createScope({
        tags: [userIdTag("123"), roleTag("admin")],
      });

      const executor = derive(
        { user: userIdTag, role: roleTag },
        ({ user, role }) => {
          return `${user}:${role}`;
        }
      );

      const result = await scope.resolve(executor);

      expect(result, "should resolve object deps with named keys").toBe("123:admin");
    });

    test("derive resolves mixed executor and tag dependencies", async () => {
      const dbExecutor = provide(() => ({ query: () => "data" }));
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const scope = createScope({ tags: [userIdTag("user123")] });

      const executor = derive([dbExecutor, userIdTag], ([db, userId]) => {
        return `${db.query()} for ${userId}`;
      });

      const result = await scope.resolve(executor);

      expect(result, "should resolve mix of executors and tags").toBe("data for user123");
    });

    test("throws when tag without default is missing", async () => {
      const requiredTag = tag(custom<string>(), { label: "required" });
      const scope = createScope({ tags: [] });

      const executor = derive([requiredTag], ([val]) => val);

      await expect(
        scope.resolve(executor),
        "should throw for missing required tag"
      ).rejects.toThrow();
    });

    test("throws when tags.required() value is missing", async () => {
      const requiredTag = tag(custom<string>(), { label: "required" });
      const scope = createScope({ tags: [] });

      const executor = derive([tags.required(requiredTag)], ([val]) => val);

      await expect(
        scope.resolve(executor),
        "should throw for missing tags.required()"
      ).rejects.toThrow();
    });

    test("returns empty array when tags.all() has no matches", async () => {
      const myTag = tag(custom<string>(), { label: "myTag" });
      const scope = createScope({ tags: [] });

      const executor = derive([tags.all(myTag)], ([values]) => values);

      const result = await scope.resolve(executor);

      expect(result, "should return empty array for no matches").toEqual([]);
    });
  });

  describe("Edge Cases", () => {
    test("schema validation throws on invalid value", () => {
      const numberTag = tag({
        "~standard": {
          vendor: "test",
          version: 1,
          validate(value) {
            if (typeof value !== "number") {
              return { issues: [{ message: "must be number" }] };
            }
            return { value };
          },
        },
      });

      expect(() => numberTag("invalid" as unknown as number)).toThrow();
    });

    test("anonymous tag (no label) works correctly", () => {
      const anonTag = tag(custom<string>());
      const store = new Map();

      anonTag.injectTo(store, "value");
      const result = anonTag.readFrom(store);

      expect(result, "anonymous tag should work").toBe("value");
    });

    test("extractFrom with different key returns undefined from array", () => {
      const testTag = tag(custom<string>(), { label: "test.meta" });
      const otherTag = tag(custom<string>(), { label: "test.other" });
      const tagArray = [otherTag("test-value")];

      const result = testTag.readFrom(tagArray);

      expect(result, "should not find different key").toBeUndefined();
    });

    test("readFrom executor with different tag returns undefined", () => {
      const testTag = tag(custom<number>(), { label: "test.exec" });
      const otherTag = tag(custom<number>(), { label: "test.other" });
      const exec = provide(() => 1, otherTag(42));

      const result = testTag.readFrom(exec);

      expect(result, "should not find different key").toBeUndefined();
    });

    test("extractFrom throws with descriptive error", () => {
      const testTag = tag(custom<number>(), { label: "test.key" });
      const store = new Map();

      expect(() => testTag.extractFrom(store)).toThrow("Value not found for key:");
    });
  });
});
