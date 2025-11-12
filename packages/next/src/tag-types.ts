import { type StandardSchemaV1 } from "./types";

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

  /**
   * Tag for attaching metadata to executors/flows/scopes.
   * @typeParam T - Value type
   * @typeParam HasDefault - When true, tag has default value (affects find return type)
   */
  export interface Tag<T, HasDefault extends boolean = false> {
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
    readonly label?: string;
    readonly default: HasDefault extends true ? T : never;

    (value?: HasDefault extends true ? T : never): Tagged<T>;
    (value: T): Tagged<T>;

    /** Extracts value from source, throws if missing and no default */
    extractFrom(source: Source): T;
    /** Reads value from source, returns undefined if missing (unless HasDefault=true) */
    readFrom(source: Source): HasDefault extends true ? T : T | undefined;
    /** Collects all values with this key from source */
    collectFrom(source: Source): T[];

    /** Writes value to store */
    injectTo(target: Store, value: T): void;

    entry(value?: HasDefault extends true ? T : never): [symbol, T];
    entry(value: T): [symbol, T];

    toString(): string;
    readonly [Symbol.toStringTag]: string;
  }

  export interface TagExecutor<T> extends Container {
    readonly [tagSymbol]: "required" | "optional" | "all";
    readonly tag: Tag<any, boolean>;
    readonly extractionMode: "extract" | "read" | "collect";
  }
}
