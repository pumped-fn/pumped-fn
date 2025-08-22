import type { StandardSchemaV1 } from "./types";
import { validate } from "./ssch";

export interface DataStore {
  get(key: unknown): unknown;
  set(key: unknown, value: unknown): unknown;
}

export interface DataAccessor<T> {
  readonly key: symbol;
  get(store: DataStore): T;
  find(store: DataStore): T | undefined;
  set(store: DataStore, value: T): void;
}

export const dataAccessor = <T>(
  key: string | symbol,
  schema: StandardSchemaV1<T>
): DataAccessor<T> => {
  const _key = typeof key === 'string' ? Symbol(key) : key;
  
  return {
    key: _key,
    
    get(store: DataStore): T {
      const value = store.get(_key);
      if (value === undefined) {
        throw new Error(`Data not found for key: ${String(key)}`);
      }

      return validate(schema, value);
    },
    
    find(store: DataStore): T | undefined {
      const maybeValue = store.get(_key);
      if (maybeValue) {
        return validate(schema, maybeValue)
      }

      return undefined
    },
    
    set(store: DataStore, value: T): void {
      const validated = validate(schema, value);
      store.set(_key, validated);
    }
  };
};