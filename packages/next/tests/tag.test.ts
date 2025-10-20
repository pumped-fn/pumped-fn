import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { tagSymbol, type Tag } from "../src/tag-types";
import { inspect } from "util";

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

describe("Tag Callable Creation", () => {
  test("tag creates Tagged value", () => {
    const emailTag = tag(custom<string>());
    const tagged = emailTag("test@example.com");

    expect(tagged.key).toBe(emailTag.key);
    expect(tagged.value).toBe("test@example.com");
    expect(tagged[tagSymbol]).toBe(true);
  });

  test("tag with default can be called without value", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const tagged = portTag();

    expect(tagged.value).toBe(3000);
  });

  test("tag with default can override default", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const tagged = portTag(8080);

    expect(tagged.value).toBe(8080);
  });

  test("tag without default throws when called without value", () => {
    const emailTag = tag(custom<string>()) as Tag.Tag<string, true>;

    expect(() => emailTag()).toThrow("Value required");
  });
});

describe("Tag Entry Method", () => {
  test("entry creates symbol-value tuple", () => {
    const emailTag = tag(custom<string>());
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

  test("entry with default can override default", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const [, value] = portTag.entry(8080);

    expect(value).toBe(8080);
  });

  test("entry without default throws when called without value", () => {
    const emailTag = tag(custom<string>()) as Tag.Tag<string, true>;

    expect(() => emailTag.entry()).toThrow();
  });

  test("entry can initialize Map", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const store = new Map([portTag.entry()]);

    expect(portTag.get(store)).toBe(3000);
  });
});

describe("Tag Set Method", () => {
  test("set mutates Store", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    emailTag.set(store, "test@example.com");
    expect(emailTag.get(store)).toBe("test@example.com");
  });

  test("set with Container returns Tagged", () => {
    const emailTag = tag(custom<string>());
    const container: Tag.Container = { tags: [] };

    const tagged = emailTag.set(container, "test@example.com");
    expect(tagged.value).toBe("test@example.com");
    expect(tagged.key).toBe(emailTag.key);
  });

  test("set with Tagged array returns Tagged", () => {
    const emailTag = tag(custom<string>());
    const tags: Tag.Tagged[] = [];

    const tagged = emailTag.set(tags, "test@example.com");
    expect(tagged.value).toBe("test@example.com");
  });

  test("set validates value via schema", () => {
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
    const store = new Map<symbol, unknown>();

    expect(() => numberTag.set(store, "invalid" as unknown as number)).toThrow();
  });
});

describe("Tag Some Method", () => {
  test("some returns all matching values from array", () => {
    const emailTag = tag(custom<string>());
    const tags: Tag.Tagged<string>[] = [
      emailTag("test1@example.com"),
      emailTag("test2@example.com"),
      emailTag("test3@example.com"),
    ];

    expect(emailTag.some(tags)).toEqual([
      "test1@example.com",
      "test2@example.com",
      "test3@example.com",
    ]);
  });

  test("some returns single value from Store", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();
    store.set(emailTag.key, "test@example.com");

    expect(emailTag.some(store)).toEqual(["test@example.com"]);
  });

  test("some returns empty array when no match", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    expect(emailTag.some(store)).toEqual([]);
  });

  test("some filters by key in mixed array", () => {
    const emailTag = tag(custom<string>());
    const nameTag = tag(custom<string>(), { label: "name" });

    const tags: Tag.Tagged[] = [
      emailTag("test@example.com"),
      nameTag("John"),
      emailTag("another@example.com"),
    ];

    expect(emailTag.some(tags)).toEqual([
      "test@example.com",
      "another@example.com",
    ]);
  });
});

describe("Tag Debug Display", () => {
  test("toString shows label for named tag", () => {
    const portTag = tag(custom<number>(), { label: "port" });

    expect(portTag.toString()).toBe("Tag(port)");
  });

  test("toString shows anonymous for nameless tag", () => {
    const anonTag = tag(custom<string>());

    expect(anonTag.toString()).toContain("Tag(");
  });

  test("Symbol.toStringTag shows label", () => {
    const portTag = tag(custom<number>(), { label: "port" });

    expect(portTag[Symbol.toStringTag]).toBe("Tag<port>");
  });

  test("Tagged value toString shows key-value", () => {
    const portTag = tag(custom<number>(), { label: "port" });
    const tagged = portTag(8080);

    expect(tagged.toString()).toBe("port=8080");
  });

  test("Tagged value inspect shows formatted output", () => {
    const portTag = tag(custom<number>(), { label: "port" });
    const tagged = portTag(8080);

    const output = inspect(tagged);
    expect(output).toContain("port");
    expect(output).toContain("8080");
  });
});
