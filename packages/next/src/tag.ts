import { type StandardSchemaV1 } from "./types";
import { validate } from "./ssch";
import { tagSymbol, type Tag } from "./tag-types";

const tagCacheMap = new WeakMap<Tag.Source, Map<symbol, unknown[]>>();

function buildTagCache(tags: Tag.Tagged[]): Map<symbol, unknown[]> {
  const map = new Map<symbol, unknown[]>();
  for (const tagged of tags) {
    const existing = map.get(tagged.key);
    if (existing) {
      existing.push(tagged.value);
    } else {
      map.set(tagged.key, [tagged.value]);
    }
  }
  return map;
}

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
  if (source === null || source === undefined) {
    return undefined;
  }

  if (isStore(source)) {
    const value = source.get(key);
    return value === undefined ? undefined : validate(schema, value);
  }

  let cache = tagCacheMap.get(source);
  if (!cache) {
    const tags = Array.isArray(source) ? source : isContainer(source) ? (source.tags ?? []) : [];
    cache = buildTagCache(tags);
    tagCacheMap.set(source, cache);
  }

  const values = cache.get(key);
  return values && values.length > 0 ? validate(schema, values[0]) : undefined;
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

  let cache = tagCacheMap.get(source);
  if (!cache) {
    const tags = Array.isArray(source) ? source : isContainer(source) ? (source.tags ?? []) : [];
    cache = buildTagCache(tags);
    tagCacheMap.set(source, cache);
  }

  const values = cache.get(key);
  return values ? values.map(v => validate(schema, v)) : [];
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

function createTagged<T>(
  key: symbol,
  schema: StandardSchemaV1<T>,
  value: T,
  label?: string
): Tag.Tagged<T> {
  const tagged: Tag.Tagged<T> = {
    [tagSymbol]: true,
    key,
    schema,
    value,
    toString() {
      const keyStr = label || key.toString();
      return `${keyStr}=${JSON.stringify(value)}`;
    },
    get [Symbol.toStringTag]() {
      return "Tagged";
    },
  };

  Object.defineProperty(tagged, Symbol.for("nodejs.util.inspect.custom"), {
    value: function (depth: number, opts: { stylize?: (str: string, style: string) => string }) {
      const keyStr = label || "anonymous";
      const valueStr = opts.stylize
        ? opts.stylize(JSON.stringify(value), "string")
        : JSON.stringify(value);
      return `Tagged { ${keyStr}: ${valueStr} }`;
    },
  });

  return tagged;
}

class TagImpl<T, HasDefault extends boolean = false> {
  public readonly key: symbol;
  public readonly schema: StandardSchemaV1<T>;
  public readonly label?: string;
  public readonly default: HasDefault extends true ? T : never;

  constructor(
    schema: StandardSchemaV1<T>,
    options?: { label?: string; default?: T }
  ) {
    this.label = options?.label;
    this.key = options?.label ? Symbol.for(options.label) : Symbol();
    this.schema = schema;
    this.default = (options?.default ?? (undefined as never)) as HasDefault extends true
      ? T
      : never;
  }

  get(source: Tag.Source): T {
    const value = extract(source, this.key, this.schema);
    if (value === undefined) {
      if (this.default !== undefined) {
        return this.default as T;
      }
      throw new Error(`Value not found for key: ${this.key.toString()}`);
    }
    return value;
  }

  find(source: Tag.Source): HasDefault extends true ? T : T | undefined {
    const value = extract(source, this.key, this.schema);
    return (value !== undefined ? value : (this.default as T | undefined)) as HasDefault extends true ? T : T | undefined;
  }

  some(source: Tag.Source): T[] {
    return collect(source, this.key, this.schema);
  }

  writeToStore(target: Tag.Store, value: T): void {
    write(target, this.key, this.schema, value);
  }

  writeToContainer(target: Tag.Container, value: T): Tag.Tagged<T> {
    if (!target || typeof target !== "object" || Array.isArray(target)) {
      throw new TypeError("writeToContainer requires Container object");
    }
    const validated = validate(this.schema, value);
    const tagged = createTagged(this.key, this.schema, validated, this.label);
    if (!target.tags) {
      target.tags = [];
    }
    target.tags.push(tagged);
    tagCacheMap.delete(target);
    return tagged;
  }

  writeToTags(target: Tag.Tagged[], value: T): Tag.Tagged<T> {
    if (!Array.isArray(target)) {
      throw new TypeError("writeToTags requires Tagged[] array");
    }
    const validated = validate(this.schema, value);
    const tagged = createTagged(this.key, this.schema, validated, this.label);
    target.push(tagged);
    tagCacheMap.delete(target);
    return tagged;
  }

  entry(value?: T): [symbol, T] {
    const val = value !== undefined ? value : this.default;
    if (val === undefined) {
      throw new Error("Value required for entry without default");
    }
    const validated = validate(this.schema, val);
    return [this.key, validated];
  }

  toString(): string {
    return this.label ? `Tag(${this.label})` : `Tag(${this.key.toString()})`;
  }

  get [Symbol.toStringTag](): string {
    return this.label ? `Tag<${this.label}>` : "Tag<anonymous>";
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.label ? `Tag { ${this.label} }` : "Tag { anonymous }";
  }
}

/**
 * Creates metadata tag for executors/flows/scopes.
 * @param schema - Validation schema (use custom<T>() for no validation)
 * @param options - Label and optional default value
 * @example tag(custom<number>(), { label: "retry", default: 3 })
 */
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
  const impl = new TagImpl<T, boolean>(schema, options);

  const fn = ((value?: T) => {
    const val = value !== undefined ? value : impl.default;
    if (val === undefined) {
      throw new Error("Value required for tag without default");
    }
    const validated = validate(schema, val);
    return createTagged(impl.key, impl.schema, validated, impl.label);
  }) as Tag.Tag<T, boolean>;

  Object.defineProperty(fn, "key", {
    value: impl.key,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(fn, "schema", {
    value: impl.schema,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(fn, "label", {
    value: impl.label,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(fn, "default", {
    value: impl.default,
    writable: false,
    configurable: false,
  });

  fn.extractFrom = impl.get.bind(impl);
  fn.readFrom = impl.find.bind(impl);
  fn.collectFrom = impl.some.bind(impl);
  fn.injectTo = impl.writeToStore.bind(impl);
  fn.writeToStore = impl.writeToStore.bind(impl);
  fn.writeToContainer = impl.writeToContainer.bind(impl);
  fn.writeToTags = impl.writeToTags.bind(impl);
  fn.entry = impl.entry.bind(impl);
  fn.toString = impl.toString.bind(impl);
  (fn as any).partial = <D extends Partial<T>>(d: D): D => {
    return Object.assign({}, createTagged(impl.key, impl.schema, {} as T, impl.label), d);
  };
  Object.defineProperty(fn, Symbol.toStringTag, {
    get: () => impl[Symbol.toStringTag],
  });
  const inspectSymbol = Symbol.for("nodejs.util.inspect.custom");
  Object.defineProperty(fn, inspectSymbol, {
    value: (impl as any)[inspectSymbol].bind(impl),
  });

  return fn;
}
