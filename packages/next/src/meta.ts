import { validate } from "./ssch";
import { metaSymbol, StandardSchemaV1, type Meta } from "./types";

export const meta = <V>(
  key: string | symbol,
  schema: StandardSchemaV1<V>
): Meta.MetaFn<V> => {
  const fn = (value: V) =>
    ({
      [metaSymbol]: true,
      key,
      schema,
      value,
    } as unknown as Meta.MetaFn<V>);

  Object.defineProperty(fn, "key", {
    value: key,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(fn, metaSymbol, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  Object.defineProperties(fn, {
    partial: {
      value: (d: Partial<V>) => {
        return Object.assign({}, fn({} as V), d);
      },
      configurable: false,
      enumerable: false,
      writable: false,
    },
    some: {
      value: (source: Meta.MetaContainer | Meta.Meta[] | undefined) =>
        findValues(source, fn as unknown as Meta.MetaFn<unknown>),
      configurable: false,
      enumerable: false,
      writable: false,
    },
    find: {
      value: (source: Meta.MetaContainer | Meta.Meta[] | undefined) =>
        findValue(source, fn as unknown as Meta.MetaFn<unknown>),
      configurable: false,
      enumerable: false,
      writable: false,
    },
    get: {
      value: (source: Meta.MetaContainer | Meta.Meta[] | undefined) =>
        getValue(
          findValue(
            source,
            fn as unknown as Meta.MetaFn<unknown>
          ) as Meta.Meta<V>
        ),
      configurable: false,
      enumerable: false,
      writable: false,
    },
  });

  return fn as any;
};

export function getValue<V>(meta: Meta.Meta<V>) {
  return validate(meta.schema, meta.value);
}

export function findValues<V = unknown>(
  executor: Meta.MetaContainer | Meta.Meta[] | undefined,
  meta: Meta.MetaFn<V>
): V[] {
  if (!executor) return [];

  const metas = Array.isArray(executor) ? executor : executor.metas ?? [];

  const maybeMeta = metas.filter((m) => m.key === meta.key);
  return maybeMeta.map((m) => getValue(m as Meta.Meta<V>));
}

export function findValue<V>(
  executor: Meta.MetaContainer | Meta.Meta[] | undefined,
  meta: Meta.MetaFn<V>
): V | undefined {
  const values = findValues(executor, meta);
  return values.at(0);
}
