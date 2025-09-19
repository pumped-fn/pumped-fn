import type { Flow } from "./types";

/**
 * Result type aliases for cleaner usage
 */
export type Result<T, E = unknown> = Flow.OK<T> | Flow.KO<E>;

/**
 * Helper functions to create Result types
 */
export const ok = <T>(data: T): Flow.OK<T> => ({
  type: "ok",
  data,
  isOk(): this is Flow.OK<T> {
    return true;
  },
  isKo(): this is never {
    return false;
  },
});

export const ko = <E>(data: E): Flow.KO<E> => ({
  type: "ko",
  data,
  isOk(): this is never {
    return false;
  },
  isKo(): this is Flow.KO<E> {
    return true;
  },
});


/**
 * Chains Result-returning functions, stopping on first error
 */
export function chain<T, U>(
  result: Result<T>,
  fn: (value: T) => Result<U>
): Result<U> {
  if (result.type === "ko") {
    return result as any;
  }
  return fn(result.data);
}

/**
 * Async version of chain
 */
export async function chainAsync<T, U>(
  result: Result<T>,
  fn: (value: T) => Promise<Result<U>>
): Promise<Result<U>> {
  if (result.type === "ko") {
    return result as any;
  }
  return await fn(result.data);
}

/**
 * Maps over a successful Result, leaving errors unchanged
 */
export function map<T, U>(
  result: Result<T>,
  fn: (value: T) => U
): Result<U> {
  if (result.type === "ko") {
    return result as any;
  }
  try {
    return ok(fn(result.data));
  } catch (error) {
    return ko(error);
  }
}

/**
 * Async version of map
 */
export async function mapAsync<T, U>(
  result: Result<T>,
  fn: (value: T) => Promise<U>
): Promise<Result<U>> {
  if (result.type === "ko") {
    return result as any;
  }
  try {
    const mapped = await fn(result.data);
    return ok(mapped);
  } catch (error) {
    return ko(error);
  }
}

/**
 * Extracts value from Result or returns default
 */
export function unwrap<T>(result: Result<T>, defaultValue: T): T {
  return result.type === "ok" ? result.data : defaultValue;
}

/**
 * Extracts value from Result or throws
 */
export function unwrapOrThrow<T>(result: Result<T>): T {
  if (result.type === "ko") {
    throw result.data;
  }
  return result.data;
}

/**
 * Combines multiple Results into one, failing if any fail
 */
export function combine<T extends readonly Result<any>[]>(
  results: T
): Result<{
  [K in keyof T]: T[K] extends Result<infer U> ? U : never;
}> {
  const values: any[] = [];

  for (const result of results) {
    if (result.type === "ko") {
      return result as any;
    }
    values.push(result.data);
  }

  return ok(values as any);
}

/**
 * Service composition helpers
 */
export namespace Service {
  /**
   * Wraps a service object to return Result types for all methods
   */
  export function wrap<T extends Record<string, (...args: any[]) => any>>(
    service: T
  ): {
    [K in keyof T]: T[K] extends (...args: infer Args) => infer R
      ? (...args: Args) => Result<R>
      : never;
  } {
    const wrapped = {} as any;

    for (const [key, method] of Object.entries(service)) {
      if (typeof method === "function") {
        wrapped[key] = (...args: any[]) => {
          try {
            const result = method.call(service, ...args);
            return ok(result);
          } catch (error) {
            return ko(error);
          }
        };
      }
    }

    return wrapped;
  }

  /**
   * Wraps an async service object to return Result types for all methods
   */
  export function wrapAsync<T extends Record<string, (...args: any[]) => Promise<any>>>(
    service: T
  ): {
    [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer R>
      ? (...args: Args) => Promise<Result<R>>
      : never;
  } {
    const wrapped = {} as any;

    for (const [key, method] of Object.entries(service)) {
      if (typeof method === "function") {
        wrapped[key] = async (...args: any[]) => {
          try {
            const result = await method.call(service, ...args);
            return ok(result);
          } catch (error) {
            return ko(error);
          }
        };
      }
    }

    return wrapped;
  }

  /**
   * Creates a service that retries failed operations
   */
  export function withRetry<T extends Record<string, (...args: any[]) => Promise<Result<any>>>>(
    service: T,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): T {
    const retryService = {} as any;

    for (const [key, method] of Object.entries(service)) {
      if (typeof method === "function") {
        retryService[key] = async (...args: any[]) => {
          let lastError;

          for (let i = 0; i <= maxRetries; i++) {
            const result = await method(...args);

            if (result.type === "ok") {
              return result;
            }

            lastError = result;

            if (i < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
            }
          }

          return lastError;
        };
      }
    }

    return retryService;
  }
}