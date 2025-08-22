import { dataAccessor, custom } from "../src";
import { test, describe, expect } from "vitest";

describe("data accessor", () => {
  test("creates unique symbols for string keys", () => {
    const accessor1 = dataAccessor<string>('test', custom<string>());
    const accessor2 = dataAccessor<string>('test', custom<string>());
    
    // Each accessor should have a unique symbol even with same string
    expect(accessor1.key).not.toBe(accessor2.key);
    expect(typeof accessor1.key).toBe('symbol');
    expect(typeof accessor2.key).toBe('symbol');
  });
  
  test("uses provided symbol directly", () => {
    const mySymbol = Symbol('custom');
    const accessor = dataAccessor<number>(mySymbol, custom<number>());
    
    expect(accessor.key).toBe(mySymbol);
  });
  
  test("validates values on set", () => {
    // Create schema that only accepts positive numbers
    const positiveNumber = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value: unknown) => {
          if (typeof value !== 'number' || value <= 0) {
            return { issues: [{ message: "Must be positive number" }] };
          }
          return { value };
        }
      }
    } as const;
    
    const accessor = dataAccessor<number>('positive', positiveNumber);
    const store = new Map();
    
    // Valid value should work
    accessor.set(store, 42);
    expect(accessor.get(store)).toBe(42);
    
    // Invalid value should throw
    expect(() => accessor.set(store, -5)).toThrow();
    expect(() => accessor.set(store, "not a number" as any)).toThrow();
  });
  
  test("get throws if value not found", () => {
    const accessor = dataAccessor<string>('missing', custom<string>());
    const store = new Map();
    
    expect(() => accessor.get(store)).toThrow("Data not found for key: missing");
  });
  
  test("find returns undefined if value not found", () => {
    const accessor = dataAccessor<string>('missing', custom<string>());
    const store = new Map();
    
    expect(accessor.find(store)).toBeUndefined();
  });
  
  test("works with Map", () => {
    const accessor = dataAccessor<{ name: string }>('user', custom<{ name: string }>());
    const store = new Map();
    
    accessor.set(store, { name: 'Alice' });
    
    expect(accessor.get(store)).toEqual({ name: 'Alice' });
    expect(accessor.find(store)).toEqual({ name: 'Alice' });
  });
  
  test("works with WeakMap", () => {
    const accessor = dataAccessor<number>('count', custom<number>());
    const store = new WeakMap();
    const key = accessor.key; // Symbols can be WeakMap keys
    
    // WeakMap requires object keys, so we need to use a wrapper
    const weakStore = {
      _map: new WeakMap(),
      _keys: new Map<unknown, object>(),
      get(k: unknown) {
        let objKey = this._keys.get(k);
        if (!objKey) return undefined;
        return this._map.get(objKey);
      },
      set(k: unknown, v: unknown) {
        let objKey = this._keys.get(k);
        if (!objKey) {
          objKey = { key: k };
          this._keys.set(k, objKey);
        }
        this._map.set(objKey, v);
      }
    };
    
    accessor.set(weakStore, 100);
    expect(accessor.get(weakStore)).toBe(100);
  });
  
  test("works with custom store implementation", () => {
    const accessor = dataAccessor<string>('message', custom<string>());
    
    // Custom store with get/set methods
    const customStore = {
      _data: {} as Record<string | symbol, unknown>,
      get(key: unknown): unknown {
        return this._data[key as string | symbol];
      },
      set(key: unknown, value: unknown): unknown {
        this._data[key as string | symbol] = value;
        return value;
      }
    };
    
    accessor.set(customStore, "Hello");
    expect(accessor.get(customStore)).toBe("Hello");
    expect(accessor.find(customStore)).toBe("Hello");
  });
  
  test("multiple accessors don't collide", () => {
    const stringAccessor = dataAccessor<string>('value', custom<string>());
    const numberAccessor = dataAccessor<number>('value', custom<number>());
    const boolAccessor = dataAccessor<boolean>('value', custom<boolean>());
    
    const store = new Map();
    
    stringAccessor.set(store, "text");
    numberAccessor.set(store, 42);
    boolAccessor.set(store, true);
    
    // Each accessor uses its own symbol, no collision
    expect(stringAccessor.get(store)).toBe("text");
    expect(numberAccessor.get(store)).toBe(42);
    expect(boolAccessor.get(store)).toBe(true);
  });
});