import { type StandardSchemaV1, type metaSymbol } from "./types";

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

  export type Source = Store | Container | Tagged[] | { metas?: Tagged[] };

  export interface Tag<T, HasDefault extends boolean = false> {
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
    readonly label?: string;
    readonly default: HasDefault extends true ? T : never;

    (value?: HasDefault extends true ? T : never): Tagged<T>;
    (value: T): Tagged<T>;

    get(source: Source): T;
    find(source: Source): HasDefault extends true ? T : T | undefined;
    some(source: Source): T[];

    set(target: Store, value: T): void;
    set(target: Container | Tagged[], value: T): Tagged<T>;

    entry(value?: HasDefault extends true ? T : never): [symbol, T];
    entry(value: T): [symbol, T];

    toString(): string;
    readonly [Symbol.toStringTag]: string;
  }
}
