import { type StandardSchemaV1 } from "./types";
import { validate } from "./primitives";

export const tagSymbol: unique symbol = Symbol.for("@pumped-fn/core/tag");

export declare namespace Tag {
  export interface Store {
    get(key: unknown): unknown;
    set(key: unknown, value: unknown): unknown | undefined;
  }

  export interface Tagged<T = unknown> {
    readonly [tagSymbol]: true;
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
    readonly value: T;
    toString(): string;
    readonly [Symbol.toStringTag]: string;
  }

  export interface Container {
    tags?: Tagged[];
  }

  export type Source = Store | Container | Tagged[];

  export interface Tag<T, HasDefault extends boolean = false> {
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
    readonly label?: string;
    readonly default: HasDefault extends true ? T : never;

    (value?: HasDefault extends true ? T : never): Tagged<T>;
    (value: T): Tagged<T>;

    extractFrom(source: Source): T;
    readFrom(source: Source): HasDefault extends true ? T : T | undefined;
    collectFrom(source: Source): T[];

    writeToStore(target: Store, value: T): void;
    writeToContainer(target: Container, value: T): Tagged<T>;
    writeToTags(target: Tagged[], value: T): Tagged<T>;

    entry(value?: HasDefault extends true ? T : never): [symbol, T];
    entry(value: T): [symbol, T];

    toString(): string;
    readonly [Symbol.toStringTag]: string;
  }

  export interface TagExecutor<TOutput, TTag = TOutput> extends Container {
    readonly [tagSymbol]: "required" | "optional" | "all";
    readonly tag: Tag<TTag, boolean>;
  }
}

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

interface HasTagStore {
  tagStore: Tag.Store;
}

function hasTagStore(source: unknown): source is HasTagStore {
  if (
    typeof source !== "object" ||
    source === null ||
    Array.isArray(source) ||
    !("tagStore" in source)
  ) {
    return false;
  }

  const record = source as Record<string, unknown>;
  if (typeof record.tagStore !== "object" || record.tagStore === null) {
    return false;
  }

  return isStore(record.tagStore as Tag.Source);
}

function isStore(source: Tag.Source): source is Tag.Store {
  if (
    typeof source !== "object" ||
    source === null ||
    !("get" in source) ||
    !("set" in source) ||
    typeof source.get !== "function" ||
    typeof source.set !== "function"
  ) {
    return false;
  }

  if (hasTagStore(source)) {
    return false;
  }

  return true;
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

  if (hasTagStore(source)) {
    const value = source.tagStore.get(key);
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

  if (hasTagStore(source)) {
    const value = source.tagStore.get(key);
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
    if (target.tags !== undefined && !Array.isArray(target.tags)) {
      throw new TypeError("Container.tags must be array if present");
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
  fn.writeToStore = impl.writeToStore.bind(impl);
  fn.writeToContainer = impl.writeToContainer.bind(impl);
  fn.writeToTags = impl.writeToTags.bind(impl);
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

export function required<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T, T> {
  return {
    [tagSymbol]: "required",
    tag,
  };
}

export function optional<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T, T> {
  return {
    [tagSymbol]: "optional",
    tag,
  };
}

export function all<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T[], T> {
  return {
    [tagSymbol]: "all",
    tag,
  };
}

export const tags: {
  required: typeof required;
  optional: typeof optional;
  all: typeof all;
} = {
  required,
  optional,
  all,
};

export function isTag<T>(input: unknown): input is Tag.Tag<T, boolean> {
  return (
    typeof input === "function" &&
    "extractFrom" in input &&
    typeof input.extractFrom === "function" &&
    "readFrom" in input &&
    typeof input.readFrom === "function" &&
    "collectFrom" in input &&
    typeof input.collectFrom === "function"
  );
}

export function isTagExecutor<TOutput, TTag = TOutput>(input: unknown): input is Tag.TagExecutor<TOutput, TTag> {
  return (
    typeof input === "object" &&
    input !== null &&
    tagSymbol in input &&
    typeof input[tagSymbol] === "string" &&
    ["required", "optional", "all"].includes(input[tagSymbol])
  );
}

export function isTagged(input: unknown): input is Tag.Tagged {
  return (
    typeof input === "object" &&
    input !== null &&
    tagSymbol in input &&
    input[tagSymbol] === true &&
    "key" in input &&
    typeof input.key === "symbol" &&
    "value" in input
  );
}

export const mergeFlowTags = (
  definitionTags?: ReadonlyArray<Tag.Tagged | undefined>,
  executionTags?: ReadonlyArray<Tag.Tagged | undefined>
): Tag.Tagged[] | undefined => {
  const hasDefinition = !!definitionTags && definitionTags.length > 0;
  const hasExecution = !!executionTags && executionTags.length > 0;

  if (!hasDefinition && !hasExecution) {
    return undefined;
  }

  const merged: Tag.Tagged[] = [];

  if (definitionTags) {
    for (const tag of definitionTags) {
      if (tag) {
        merged.push(tag);
      }
    }
  }

  if (executionTags) {
    for (const tag of executionTags) {
      if (tag) {
        merged.push(tag);
      }
    }
  }

  return merged.length > 0 ? merged : undefined;
};
