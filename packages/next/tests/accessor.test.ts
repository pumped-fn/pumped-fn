import { test, expect, describe } from "vitest";
import { accessor } from "../src/accessor";
import { custom } from "../src/ssch";
import type { DataStore } from "../src/accessor";

describe("accessor", () => {
  const createStore = (): DataStore => {
    const data = new Map<unknown, unknown>();
    return {
      get: (key) => data.get(key),
      set: (key, value) => data.set(key, value),
    };
  };

  describe("without default value", () => {
    test("should get value from store", () => {
      const store = createStore();
      const stringAccessor = accessor("test", custom<string>());

      stringAccessor.set(store, "hello");
      expect(stringAccessor.get(store)).toBe("hello");
    });

    test("should find value from store", () => {
      const store = createStore();
      const stringAccessor = accessor("test", custom<string>());

      stringAccessor.set(store, "hello");
      expect(stringAccessor.find(store)).toBe("hello");
    });

    test("should throw when getting missing value", () => {
      const store = createStore();
      const stringAccessor = accessor("test", custom<string>());

      expect(() => stringAccessor.get(store)).toThrow(
        "Value not found for key"
      );
    });

    test("should return undefined when finding missing value", () => {
      const store = createStore();
      const stringAccessor = accessor("test", custom<string>());

      expect(stringAccessor.find(store)).toBeUndefined();
    });
  });

  describe("with default value", () => {
    test("should get value from store", () => {
      const store = createStore();
      const stringAccessor = accessor("test", custom<string>(), "default");

      stringAccessor.set(store, "hello");
      expect(stringAccessor.get(store)).toBe("hello");
    });

    test("should return default when getting missing value", () => {
      const store = createStore();
      const stringAccessor = accessor("test", custom<string>(), "default");

      expect(stringAccessor.get(store)).toBe("default");
    });

    test("should return default when finding missing value", () => {
      const store = createStore();
      const stringAccessor = accessor("test", custom<string>(), "default");

      expect(stringAccessor.find(store)).toBe("default");
    });

    test("should always return T type (never undefined)", () => {
      const store = createStore();
      const stringAccessor = accessor("test", custom<string>(), "default");

      const value: string = stringAccessor.find(store);
      expect(value).toBe("default");
    });
  });

  describe("preset functionality", () => {
    test("should create preset tuple", () => {
      const stringAccessor = accessor("test", custom<string>());
      const [key, value] = stringAccessor.preset("hello");

      expect(key).toBe(stringAccessor.key);
      expect(value).toBe("hello");
    });
  });

  describe("symbol key handling", () => {
    test("should handle symbol keys", () => {
      const sym = Symbol("test");
      const stringAccessor = accessor(sym, custom<string>());

      expect(stringAccessor.key).toBe(sym);
    });

    test("should convert string keys to symbols", () => {
      const stringAccessor = accessor("test", custom<string>());

      expect(typeof stringAccessor.key).toBe("symbol");
      expect(stringAccessor.key.toString()).toBe("Symbol(test)");
    });
  });
});
