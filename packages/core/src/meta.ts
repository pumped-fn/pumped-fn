import { validateInput, type StandardSchemaV1 } from "./standardschema";
import { Executor, isExecutor } from "./types";

export const metaSymbol = Symbol.for("pumped-fn.meta");

export interface Meta<V = unknown> {
  readonly [metaSymbol]: true;
  readonly key: string | symbol;
  readonly schema: StandardSchemaV1<V>;
  readonly value: V;
}

export interface MetaFn<V> {
  (value: V): Meta<V>;
  readonly key: string | symbol;
  partial: <D extends Partial<V>>(d: D) => D;
}

export const isMeta = (value: unknown): value is Meta<unknown> => {
  return !!value && typeof value === "object" && metaSymbol in value;
};

export const meta = <V>(key: string | symbol, schema: StandardSchemaV1<V>): MetaFn<V> => {
  const fn = (value: V) =>
    ({
      [metaSymbol]: true,
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

  Object.defineProperty(fn, "partial", {
    value: (value: any) => value,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return fn as any;
};

export type InferMeta<S> = S extends Meta<infer V> ? V : never;

export function getValue<V>(meta: Meta<V>) {
  return validateInput(meta.schema, meta.value);
}

interface MetaContainer {
  metas?: Meta[];
}

export function findValues<V = unknown>(executor: MetaContainer | Meta[] | undefined, meta: MetaFn<V>): V[] {
  if (!executor) return [];

  const metas = Array.isArray(executor) ? executor : (executor.metas ?? []);

  const maybeMeta = metas.filter((m) => m.key === meta.key);
  return maybeMeta.map((m) => getValue(m as Meta<V>));
}

export function findValue<V>(executor: MetaContainer | Meta[] | undefined, meta: MetaFn<V>): V | undefined {
  const values = findValues(executor, meta);
  return values.at(0);
}
