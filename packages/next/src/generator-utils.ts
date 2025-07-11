export function isGenerator<Y = unknown, T = unknown>(
  value: unknown
): value is Generator<Y, T> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as any)[Symbol.iterator] === "function" &&
    typeof (value as any).next === "function" &&
    typeof (value as any).return === "function" &&
    typeof (value as any).throw === "function"
  );
}

export function isAsyncGenerator<Y = unknown, T = unknown>(
  value: unknown
): value is AsyncGenerator<Y, T> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as any)[Symbol.asyncIterator] === "function" &&
    typeof (value as any).next === "function" &&
    typeof (value as any).return === "function" &&
    typeof (value as any).throw === "function"
  );
}

export function isGeneratorFunction(fn: unknown): fn is GeneratorFunction {
  return (
    typeof fn === "function" &&
    fn.constructor &&
    fn.constructor.name === "GeneratorFunction"
  );
}

export function isAsyncGeneratorFunction(
  fn: unknown
): fn is AsyncGeneratorFunction {
  return (
    typeof fn === "function" &&
    fn.constructor &&
    fn.constructor.name === "AsyncGeneratorFunction"
  );
}

export function isIterableOrAsyncIterable(
  value: unknown
): value is Iterable<unknown> | AsyncIterable<unknown> {
  return isGenerator(value) || isAsyncGenerator(value);
}

export async function collectFromGenerator<Y, T>(
  gen: Generator<Y, T> | AsyncGenerator<Y, T>
): Promise<{ yielded: Y[]; returned: T }> {
  const yielded: Y[] = [];
  let returned: T;

  try {
    let result: IteratorResult<Y, T>;
    
    do {
      result = await gen.next();
      if (!result.done) {
        yielded.push(result.value);
      } else {
        returned = result.value;
      }
    } while (!result.done);

    return { yielded, returned: returned! };
  } catch (error) {
    // Ensure generator is closed on error
    await gen.return?.(undefined as any);
    throw error;
  }
}

export interface GeneratorHandler<Y, T> {
  onYield?: (value: Y, index: number) => void | Promise<void>;
  onReturn?: (value: T) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}

export async function processGenerator<Y, T>(
  gen: Generator<Y, T> | AsyncGenerator<Y, T>,
  handler: GeneratorHandler<Y, T>
): Promise<T> {
  let index = 0;
  
  try {
    let result: IteratorResult<Y, T>;
    
    do {
      result = await gen.next();
      
      if (!result.done) {
        await handler.onYield?.(result.value, index++);
      } else {
        await handler.onReturn?.(result.value);
        return result.value;
      }
    } while (true);
  } catch (error) {
    await handler.onError?.(error);
    // Ensure generator is closed
    await gen.return?.(undefined as any);
    throw error;
  }
}