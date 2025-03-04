import { Cleanup, EffectOutput, MutableOutput, Output, ResourceOutput, outputSymbol } from "./core";

export const isOutput = <T>(value: unknown): value is Output<T> =>
  typeof value === "object" && value !== null && outputSymbol in value;

export const isResouceOutput = <T>(value: unknown): value is ResourceOutput<T> =>
  isOutput(value) && value[outputSymbol] === "resource";

export const isEffectOutput = (value: unknown): value is EffectOutput =>
  isOutput(value) && value[outputSymbol] === "effect";

export const mutable = <T>(value: T): MutableOutput<T> => ({
  value,
  [outputSymbol]: "mutable",
});

export const resource = <T>(value: T, cleanup: Cleanup): ResourceOutput<T> => ({
  value,
  cleanup,
  [outputSymbol]: "resource",
});

export const effect = (cleanup: Cleanup): EffectOutput => ({
  value: undefined as never,
  cleanup,
  [outputSymbol]: "effect",
});
