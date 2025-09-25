import { validate } from "./ssch";
import { metaSymbol, StandardSchemaV1, type Meta } from "./types";

class MetaFunction<V> {
  public readonly key: symbol;
  public readonly schema: StandardSchemaV1<V>;
  public readonly [metaSymbol] = true;

  constructor(key: string | symbol, schema: StandardSchemaV1<V>) {
    this.key = typeof key === "string" ? Symbol(key) : key;
    this.schema = schema;
  }

  __call(value: V): Meta.Meta<V> {
    return {
      [metaSymbol]: true,
      key: this.key,
      schema: this.schema,
      value,
    } as Meta.Meta<V>;
  }

  partial<D extends Partial<V>>(d: D): D {
    return Object.assign({}, this.__call({} as V), d);
  }

  some(source: Meta.MetaContainer | Meta.Meta[] | undefined): V[] {
    return findValues(source, this as unknown as Meta.MetaFn<unknown>) as V[];
  }

  find(source: Meta.MetaContainer | Meta.Meta[] | undefined): V | undefined {
    return findValue(source, this as unknown as Meta.MetaFn<unknown>) as
      | V
      | undefined;
  }

  get(source: Meta.MetaContainer | Meta.Meta[] | undefined): V {
    const values = findValues(
      source,
      this as unknown as Meta.MetaFn<unknown>
    ) as V[];
    if (values.length === 0) {
      throw new Error(`Meta value with key ${String(this.key)} not found`);
    }
    return values[0];
  }
}

export const meta = <V>(
  key: string | symbol,
  schema: StandardSchemaV1<V>
): Meta.MetaFn<V> => {
  const metaFunc = new MetaFunction(key, schema);

  const fn = ((value: V) => metaFunc.__call(value)) as Meta.MetaFn<V>;

  Object.defineProperty(fn, "key", {
    value: metaFunc.key,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(fn, metaSymbol, {
    value: true,
    writable: false,
    configurable: false,
  });
  fn.partial = metaFunc.partial.bind(metaFunc);
  fn.some = metaFunc.some.bind(metaFunc);
  fn.find = metaFunc.find.bind(metaFunc);
  fn.get = metaFunc.get.bind(metaFunc);

  return fn;
};

export function getValue<V>(meta: Meta.Meta<V>): Awaited<V> {
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
