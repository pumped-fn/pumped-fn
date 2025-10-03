import { type Flow } from "../src/types";

export function assertError(value: unknown): asserts value is Error {
  if (!(value instanceof Error)) {
    throw new Error(`Expected Error instance, got ${typeof value}`);
  }
}

export function assertOk<S, E>(
  value: Flow.OutputLike<S, E>
): asserts value is Flow.OK<S> {
  if (!value.isOk()) {
    throw new Error(`Expected OK result, got KO`);
  }
}

export function assertKo<S, E>(
  value: Flow.OutputLike<S, E>
): asserts value is Flow.KO<E> {
  if (!value.isKo()) {
    throw new Error(`Expected KO result, got OK`);
  }
}
