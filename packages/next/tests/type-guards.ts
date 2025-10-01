import { type Flow } from "../src/types";

export function assertOk<S, E>(
  result: Flow.OK<S> | Flow.KO<E>
): asserts result is Flow.OK<S> {
  if (result.type !== "ok") {
    throw new Error(`Expected ok result, got ${result.type}`);
  }
}

export function assertKo<S, E>(
  result: Flow.OK<S> | Flow.KO<E>
): asserts result is Flow.KO<E> {
  if (result.type !== "ko") {
    throw new Error(`Expected ko result, got ${result.type}`);
  }
}

export function assertError(value: unknown): asserts value is Error {
  if (!(value instanceof Error)) {
    throw new Error(`Expected Error instance, got ${typeof value}`);
  }
}

export function assertKoResult<S, E>(
  value: unknown
): asserts value is Flow.KO<E> {
  if (
    !value ||
    typeof value !== "object" ||
    !("type" in value) ||
    value.type !== "ko"
  ) {
    throw new Error(`Expected ko result object, got ${typeof value}`);
  }
}

export function assertResultType<T extends { type: string }>(
  result: T,
  type: "ok"
): asserts result is Extract<T, { type: "ok" }>;
export function assertResultType<T extends { type: string }>(
  result: T,
  type: "ko"
): asserts result is Extract<T, { type: "ko" }>;
export function assertResultType<T extends { type: string }>(
  result: T,
  expectedType: string
): void {
  if (result.type !== expectedType) {
    throw new Error(`Expected ${expectedType} result, got ${result.type}`);
  }
}
