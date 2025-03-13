export type Factory<P, D = undefined> = (value: D, scope: Scope) => P | Promise<P>;

export type Immutable = { kind: "immutable" };
export type Mutable = { kind: "mutable" };
export type Effect = { kind: "effect" };
export type Reactive = { kind: "reactive" };
export type Resource = { kind: "resource" };
export type ReactiveResource = { kind: "reactive-resource" };
export type Reference = { kind: "reference"; to: Executor<unknown>[] };

export const executorSymbol = Symbol("jumped-fn.executor");

export function isExecutor<T>(value: unknown): value is Executor<T> {
  return typeof value === "object" && value !== null && executorSymbol in value;
}

export interface Executor<T> {
  [executorSymbol]: Immutable | Mutable | Effect | Reactive | Resource | ReactiveResource | Reference;
  readonly factory: (dependencies: unknown, scope: Scope) => T | Promise<T>;
  readonly dependencies: Executor<unknown>[] | Record<string, Executor<unknown>> | Executor<unknown> | undefined;
  readonly id: string;
}

export interface ImmutableExecutor<T> extends Executor<T> {
  [executorSymbol]: Immutable;
}

export interface ResourceExecutor<T> extends Executor<[T, Cleanup]> {
  [executorSymbol]: Resource;
}

export interface ReactiveExecutor<T> extends Executor<T> {
  [executorSymbol]: Reactive;
}

export interface ReactiveResourceExecutor<T> extends Executor<[T, Cleanup]> {
  [executorSymbol]: ReactiveResource;
}

export interface ReferenceExecutor<T> extends Executor<T> {
  [executorSymbol]: Reference;
}

export interface MutableExecutor<T> extends Executor<T> {
  [executorSymbol]: Mutable;
}

export interface EffectExecutor extends Executor<Cleanup> {
  [executorSymbol]: Effect;
}

export type InferOutput<T> = T extends
  | ImmutableExecutor<infer U>
  | MutableExecutor<infer U>
  | ResourceExecutor<infer U>
  | ReactiveExecutor<infer U>
  | ReactiveResourceExecutor<infer U>
  | ReferenceExecutor<infer U>
  ? Awaited<U>
  : T extends EffectExecutor
    ? Cleanup
    : T extends Record<string, Executor<unknown>>
      ? { [K in keyof T]: InferOutput<T[K]> }
      : T extends [...infer U]
        ? { [K in keyof U]: InferOutput<U[K]> }
        : unknown;

export interface Scope {
  readonly isDisposed: boolean;
  get<T>(executor: Executor<T>): GetAccessor<T> | undefined;

  resolve<T extends Executor<unknown>>(executor: T): Promise<GetAccessor<InferOutput<T>>>;
  update<T>(executor: MutableExecutor<T>, updateFn: T | ((current: T) => T)): Promise<void>;
  reset<T>(executor: Executor<T>): Promise<void>;
  release(executor: Executor<any>, soft?: boolean): Promise<void>;

  dispose(): Promise<void>;
  on<T>(executor: Executor<T>, listener: (value: T) => void): Cleanup;
  once<T>(executor: Executor<T>): Promise<void>;

  addCleanup(cleanup: Cleanup): Cleanup;
}

export type Cleanup = () => void | Promise<void>;

export const outputSymbol = Symbol("jumped-fn.output");
export interface Output<T> {
  value: T;
  [outputSymbol]: string;
}

export interface GetAccessor<T> {
  get: () => Awaited<T>;
}

export const getAccessor = <T>(get: () => T): GetAccessor<T> => ({
  get: () => get() as Awaited<T>,
});
