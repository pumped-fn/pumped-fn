export declare namespace Result {
  export interface OK<Value> {
    kind: "ok";
    value: Value;
  }

  export interface KO {
    kind: "ko";
    error: unknown;
  }
}
export type Result<Value> = Result.OK<Value> | Result.KO;

export const results = {
  ok<V>(value: V): Result<V> {
    return { kind: "ok", value };
  },
  ko<V = unknown, E = unknown>(error: E): Result<V> {
    return { kind: "ko", error };
  },
  isOk<V, E>(result: Result<V>): result is Result.OK<V> {
    return result.kind === "ok";
  },
  isKO<V, E>(result: Result<V>): result is Result.KO {
    return result.kind === "ko";
  },
  async toResult<V>(fn: () => V | Promise<V>, onError?: (error: unknown) => unknown): Promise<Result<V>> {
    try {
      const value = await fn();
      return results.ok(value);
    } catch (error) {
      return results.ko(onError ? onError(error) : error);
    }
  },
  mapError<V, E>(result: Result<V>, fn: (error: unknown) => E): Result<V> {
    return results.isKO(result) ? results.ko(fn(result.error)) : result;
  },
  mapValue<V1, V2>(result: Result<V1>, fn: (value: V1) => V2): Result<V2> {
    return results.isOk(result) ? results.ok(fn(result.value)) : result;
  },
  map<V1, V2, E>(
    result: Result<V1>,
    onValue: (value: V1) => V2,
    onError: (error: unknown) => E,
  ): Result<V2> | Result<unknown> {
    return results.isOk(result) ? results.ok(onValue(result.value)) : results.ko(onError(result.error));
  },
  switchError<O, V>(result: Result<O>, fn: (error: unknown) => V): Result<V | O> {
    return results.isKO(result) ? results.ok(fn(result.error)) : result;
  },
  unwrap<V>(result: Result<V>): V {
    if (results.isOk(result)) {
      return result.value;
    } else {
      throw result.error;
    }
  },
};
