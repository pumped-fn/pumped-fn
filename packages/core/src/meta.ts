import { validateInput, type StandardSchemaV1 } from "./standardschema";

export const metaSymbol = Symbol.for("pumped-fn.meta");

export interface Meta<V = unknown> {
  readonly key: string | symbol;
  readonly schema: StandardSchemaV1<V>;
  readonly value: V;
}

export interface MetaFn<V> {
  (value: V): Meta<V>;
  readonly key: string | symbol;
}

export const isMeta = (value: unknown): value is Meta<unknown> => {
  return typeof value === "function" && metaSymbol in value;
};

export const meta = <V>(key: string | symbol, schema: StandardSchemaV1<V>): MetaFn<V> => {
  const fn = (value: V) =>
    ({
      key,
      schema,
      value,
    }) as unknown as MetaFn<V>;

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

  return fn as any;
};

export type InferMeta<S> = S extends Meta<infer V> ? V : never;

export async function getValue<V>(meta: Meta<V>) {
  return await validateInput(meta.schema, meta.value);
}

export async function findValues<V = unknown>(metas: Meta<unknown>[] | undefined, meta: MetaFn<V>): Promise<V[]> {
  if (!metas) {
    return [];
  }

  const maybeMeta = metas.filter((m) => m.key === meta.key);

  return Promise.all(maybeMeta.map(async (m) => getValue(m as Meta<V>)));
}

export async function findValue<V>(metas: Meta<unknown>[] | undefined, meta: MetaFn<V>): Promise<V | undefined> {
  const values = await findValues(metas, meta);
  return values.at(0);
}
