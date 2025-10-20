import { type StandardSchemaV1 } from "./types";
import { validate } from "./ssch";
import { tagSymbol, type Tag } from "./tag-types";

function isStore(source: Tag.Source): source is Tag.Store {
  return (
    typeof source === "object" &&
    source !== null &&
    "get" in source &&
    "set" in source &&
    typeof source.get === "function" &&
    typeof source.set === "function"
  );
}

function isContainer(source: Tag.Source): source is Tag.Container {
  return (
    typeof source === "object" &&
    source !== null &&
    "tags" in source &&
    !Array.isArray(source)
  );
}

function extract<T>(
  source: Tag.Source,
  key: symbol,
  schema: StandardSchemaV1<T>
): T | undefined {
  if (isStore(source)) {
    const value = source.get(key);
    return value === undefined ? undefined : validate(schema, value);
  }

  const tags = Array.isArray(source) ? source : source.tags ?? [];
  const tagged = tags.find((t) => t.key === key);
  return tagged ? validate(schema, tagged.value) : undefined;
}

function collect<T>(
  source: Tag.Source,
  key: symbol,
  schema: StandardSchemaV1<T>
): T[] {
  if (isStore(source)) {
    const value = source.get(key);
    return value === undefined ? [] : [validate(schema, value)];
  }

  const tags = Array.isArray(source) ? source : source.tags ?? [];
  return tags.filter((t) => t.key === key).map((t) => validate(schema, t.value));
}

function write<T>(
  store: Tag.Store,
  key: symbol,
  schema: StandardSchemaV1<T>,
  value: T
): void {
  const validated = validate(schema, value);
  store.set(key, validated);
}

export function tag<T>(schema: StandardSchemaV1<T>): Tag.Tag<T, false>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options: { label?: string; default: T }
): Tag.Tag<T, true>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options?: { label?: string }
): Tag.Tag<T, false>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options?: { label?: string; default?: T }
): Tag.Tag<T, boolean> {
  throw new Error("Not implemented");
}
