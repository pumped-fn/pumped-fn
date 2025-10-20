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

  set(target: Tag.Store, value: T): void;
  set(target: Tag.Container | Tag.Tagged[], value: T): Tag.Tagged<T>;
  set(target: Tag.Source, value: T): void | Tag.Tagged<T> {
    if (isStore(target)) {
      write(target, this.key, this.schema, value);
      return;
    }

    const validated = validate(this.schema, value);
    return createTagged(this.key, this.schema, validated, this.label);
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

  fn.get = impl.get.bind(impl);
  fn.find = impl.find.bind(impl);
  fn.some = impl.some.bind(impl);
  fn.set = impl.set.bind(impl) as typeof impl.set;
  fn.entry = impl.entry.bind(impl);
  fn.toString = impl.toString.bind(impl);
  Object.defineProperty(fn, Symbol.toStringTag, {
    get: () => impl[Symbol.toStringTag],
  });
  const inspectSymbol = Symbol.for("nodejs.util.inspect.custom");
  Object.defineProperty(fn, inspectSymbol, {
    value: (impl as any)[inspectSymbol].bind(impl),
  });

  return fn;
}
