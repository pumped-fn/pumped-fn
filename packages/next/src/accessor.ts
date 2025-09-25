import { validate } from "./ssch";
import type { Accessor, Meta, StandardSchemaV1 } from "./types";

function isDataStore(
  source: Accessor.AccessorSource
): source is Accessor.DataStore {
  return (
    "get" in source &&
    "set" in source &&
    typeof source.get === "function" &&
    typeof source.set === "function"
  );
}

function isMetaArray(source: Accessor.AccessorSource): source is Meta.Meta[] {
  return Array.isArray(source);
}

function extractFromSource<T>(
  source: Accessor.AccessorSource,
  key: symbol,
  schema: StandardSchemaV1<T>
): T | undefined {
  if (isDataStore(source)) {
    const value = source.get(key);
    return value === undefined ? undefined : validate(schema, value);
  }

  if (isMetaArray(source)) {
    const meta = source.find((m) => m.key === key);
    return meta ? validate(schema, meta.value) : undefined;
  }

  const metas = source.metas ?? [];
  const meta = metas.find((m) => m.key === key);
  return meta ? validate(schema, meta.value) : undefined;
}

function validateAndSet<T>(
  source: Accessor.DataStore,
  key: symbol,
  schema: StandardSchemaV1<T>,
  value: T
): void {
  if (!isDataStore(source)) {
    throw new Error("set() can only be used with DataStore");
  }
  const validated = validate(schema, value);
  source.set(key, validated);
}

function validateAndPreset<T>(
  key: symbol,
  schema: StandardSchemaV1<T>,
  value: T
): [symbol, T] {
  const validated = validate(schema, value);
  return [key, validated];
}

class AccessorImpl<T> implements Accessor.Accessor<T> {
  public readonly key: symbol;
  public readonly schema: StandardSchemaV1<T>;

  constructor(key: string | symbol, schema: StandardSchemaV1<T>) {
    this.key = typeof key === "string" ? Symbol(key) : key;
    this.schema = schema;
  }

  get(source: Accessor.AccessorSource): T {
    const value = extractFromSource(source, this.key, this.schema);
    if (value === undefined) {
      throw new Error(`Value not found for key: ${this.key.toString()}`);
    }
    return value;
  }

  find(source: Accessor.AccessorSource): T | undefined {
    return extractFromSource(source, this.key, this.schema);
  }

  set(source: Accessor.DataStore, value: T): void {
    validateAndSet(source, this.key, this.schema, value);
  }

  preset(value: T): [symbol, T] {
    return validateAndPreset(this.key, this.schema, value);
  }
}

class AccessorWithDefaultImpl<T> implements Accessor.AccessorWithDefault<T> {
  public readonly key: symbol;
  public readonly schema: StandardSchemaV1<T>;
  public readonly defaultValue: T;

  constructor(
    key: string | symbol,
    schema: StandardSchemaV1<T>,
    defaultValue: T
  ) {
    this.key = typeof key === "string" ? Symbol(key) : key;
    this.schema = schema;
    this.defaultValue = validate(schema, defaultValue);
  }

  get(source: Accessor.AccessorSource): T {
    const value = extractFromSource(source, this.key, this.schema);
    return value ?? this.defaultValue;
  }

  find(source: Accessor.AccessorSource): T {
    const value = extractFromSource(source, this.key, this.schema);
    return value ?? this.defaultValue;
  }

  set(source: Accessor.DataStore, value: T): void {
    validateAndSet(source, this.key, this.schema, value);
  }

  preset(value: T): [symbol, T] {
    return validateAndPreset(this.key, this.schema, value);
  }
}

export function accessor<T>(
  key: string | symbol,
  schema: StandardSchemaV1<T>
): Accessor.Accessor<T>;

export function accessor<T>(
  key: string | symbol,
  schema: StandardSchemaV1<T>,
  defaultValue: T
): Accessor.AccessorWithDefault<T>;

export function accessor<T>(
  key: string | symbol,
  schema: StandardSchemaV1<T>,
  defaultValue?: T
): Accessor.Accessor<T> | Accessor.AccessorWithDefault<T> {
  if (defaultValue !== undefined) {
    return new AccessorWithDefaultImpl(key, schema, defaultValue);
  }
  return new AccessorImpl(key, schema);
}
