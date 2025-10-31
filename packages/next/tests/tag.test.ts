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
    expect(emailTag.readFrom(store)).toBe("test@example.com");
  });

  test("detects Tagged array source type", () => {
    const emailTag = tag(custom<string>());
    const tagged: Tag.Tagged<string>[] = [
      emailTag("test@example.com"),
    ];

    expect(emailTag.readFrom(tagged)).toBe("test@example.com");
  });

  test("detects Container source type", () => {
    const emailTag = tag(custom<string>());
    const container: Tag.Container = {
      tags: [
        emailTag("test@example.com"),
      ],
    };

    expect(emailTag.readFrom(container)).toBe("test@example.com");
  });
});

describe("Tag Creation and Retrieval", () => {
  test("tag without default requires value for extractFrom", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    expect(() => emailTag.extractFrom(store)).toThrow();
  });

  test("tag without default returns undefined for readFrom", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    expect(emailTag.readFrom(store)).toBeUndefined();
  });

  test("tag with default never throws on extractFrom", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const store = new Map<symbol, unknown>();

    expect(portTag.extractFrom(store)).toBe(3000);
  });

  test("tag with default returns default for readFrom", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const store = new Map<symbol, unknown>();

    expect(portTag.readFrom(store)).toBe(3000);
  });

  test("tag retrieves stored value", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    store.set(emailTag.key, "test@example.com");
    expect(emailTag.extractFrom(store)).toBe("test@example.com");
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
    const emailTag = tag(custom<string>()) as unknown as Tag.Tag<string, true>;

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
    const emailTag = tag(custom<string>()) as unknown as Tag.Tag<string, true>;

    expect(() => emailTag.entry()).toThrow();
  });

  test("entry can initialize Map", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const store = new Map([portTag.entry()]);

    expect(portTag.extractFrom(store)).toBe(3000);
  });
});

describe("Tag InjectTo Method", () => {
  test("injectTo mutates Store", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    emailTag.injectTo(store, "test@example.com");
    expect(emailTag.extractFrom(store)).toBe("test@example.com");
  });

  test("injectTo validates value via schema", () => {
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

    expect(() => numberTag.injectTo(store, "invalid" as unknown as number)).toThrow();
  });
});

describe("Tag CollectFrom Method", () => {
  test("collectFrom returns all matching values from array", () => {
    const emailTag = tag(custom<string>());
    const tags: Tag.Tagged<string>[] = [
      emailTag("test1@example.com"),
      emailTag("test2@example.com"),
      emailTag("test3@example.com"),
    ];

    expect(emailTag.collectFrom(tags)).toEqual([
      "test1@example.com",
      "test2@example.com",
      "test3@example.com",
    ]);
  });

  test("collectFrom returns single value from Store", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();
    store.set(emailTag.key, "test@example.com");

    expect(emailTag.collectFrom(store)).toEqual(["test@example.com"]);
  });

  test("collectFrom returns empty array when no match", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    expect(emailTag.collectFrom(store)).toEqual([]);
  });

  test("collectFrom filters by key in mixed array", () => {
    const emailTag = tag(custom<string>());
    const nameTag = tag(custom<string>(), { label: "name" });

    const tags: Tag.Tagged[] = [
      emailTag("test@example.com"),
      nameTag("John"),
      emailTag("another@example.com"),
    ];

    expect(emailTag.collectFrom(tags)).toEqual([
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
