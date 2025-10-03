# Flow API - Expected Design

## Overview

This document describes the expected Flow API design based on standard JavaScript Promise patterns. The API eliminates Result types (OK/KO) in favor of direct returns and error throwing.

## Core Principles

1. **Promise-based error handling** - throw for errors, return for success
2. **Type inference** - minimal generic parameters needed
3. **Flexible signatures** - support nameless flows, dependencies, void input
4. **Journaling** - deterministic replay via ctx.run()
5. **Composition** - FP operations on FlowPromise

## API Patterns

### 1. Nameless Flows

**Shortest form - handler only:**
```typescript
const double = flow((_ctx, input: number) => input * 2);
const result = await flow.execute(double, 5);
expect(result).toBe(10);
```

**With explicit generics:**
```typescript
const impl = flow<{ value: number }>((ctx, input) => {
  return { result: input.value * 2 };
});
const result = await flow.execute(impl, { value: 5 });
```

**With input and output types:**
```typescript
const stringToNumber = flow<string, number>((ctx, input) => {
  return Number(input);
});
const result = await flow.execute(stringToNumber, "42");
```

### 2. Void Input Flows

**No parameter needed:**
```typescript
const noInput = flow<void, number>(() => {
  return 42;
});
const result = await flow.execute(noInput);
```

**With extensions:**
```typescript
const result = await flow.execute(noInput, undefined, {
  extensions: []
});
```

**Sub-flow with void input:**
```typescript
const noInputSub = flow<void, number>(() => 100);

const main = flow<void, number>(
  { name: "main" },
  async (ctx) => {
    const sub = await ctx.exec(noInputSub);
    return sub + 1;
  }
);
```

### 3. Dependency Injection

**Nameless with dependencies:**
```typescript
const config = provide(() => ({ multiplier: 10 }));

const multiply = flow({ config }, ({ config }, _ctx, input: number) => {
  return input * config.multiplier;
});

const result: number = await flow.execute(multiply, 5);
```

**Dependencies with definition:**
```typescript
const logger = provide(() => ({ log: vi.fn() }));

const loggedFlow = flow(
  logger,
  {
    name: "logger-flow",
    input: custom<string>(),
    success: custom<string>(),
  },
  (deps, _ctx, input) => {
    deps.log(`Processing: ${input}`);
    return input.toUpperCase();
  }
);
```

**Complex example with nested flows:**
```typescript
const api = provide(() => ({ fetch: fetchMock }));

const fetchUser = flow({ api }, async ({ api }, ctx, id: number) => {
  const response = await ctx.run("fetch-user", () =>
    api.fetch(`/users/${id}`)
  );
  return { userId: id, username: `user${id}`, raw: response.data };
});

const fetchPosts = flow({ api }, async ({ api }, ctx, userId: number) => {
  const response = await ctx.run("fetch-posts", () =>
    api.fetch(`/posts?userId=${userId}`)
  );
  return { posts: [{ id: 1, title: "Post 1" }], raw: response.data };
});

const getUserWithPosts = flow(
  { api },
  async ({ api }, ctx, userId: number) => {
    const user = await ctx.exec(fetchUser, userId);
    const posts = await ctx.exec(fetchPosts, userId);
    const enriched = await ctx.run("enrich", () => ({
      ...user,
      postCount: posts.posts.length,
    }));
    return enriched;
  }
);
```

### 4. Definition Pattern

**Pattern 1: Generic types with handler:**
```typescript
const impl = flow<{ value: number }, { result: number }>(
  { name: "double" },
  (ctx, input) => {
    return { result: input.value * 2 };
  }
);
```

**Pattern 2: Schema-based with inferred types:**
```typescript
const impl = flow(
  {
    name: "triple",
    input: custom<{ value: number }>(),
    success: custom<{ result: number }>(),
  },
  (ctx, input) => {
    return { result: input.value * 3 };
  }
);
```

**Pattern 3: Definition then handler:**
```typescript
const definition = flow({
  name: "square",
  input: custom<{ x: number }>(),
  success: custom<{ y: number }>(),
});

const impl = definition.handler((ctx, input) => {
  return { y: input.x * input.x };
});
```

### 5. Context Methods

**ctx.run() - Journaling:**
```typescript
const impl = flow<{ url: string }, { data: string }>(
  { name: "fetch-flow" },
  async (ctx, input) => {
    const data = await ctx.run("fetch", () => fetchMock());
    return { data };
  }
);
```

**ctx.exec() - Sub-flows:**
```typescript
const subFlow = flow<{ n: number }, { doubled: number }>(
  { name: "sub" },
  (ctx, input) => ({ doubled: input.n * 2 })
);

const mainFlow = flow<{ value: number }, { result: number }>(
  { name: "main" },
  async (ctx, input) => {
    const sub = await ctx.exec(subFlow, { n: input.value });
    return { result: sub.doubled };
  }
);
```

**ctx.parallel() - Parallel execution:**
```typescript
const main = flow<{ val: number }, { sum: number }>(
  { name: "parallel-flow" },
  async (ctx, input) => {
    const p1 = ctx.exec(flow1, { x: input.val });
    const p2 = ctx.exec(flow2, { x: input.val });
    const result = await ctx.parallel([p1, p2]);

    const sum = result.results[0].r + result.results[1].r;
    return { sum };
  }
);
```

**ctx.parallelSettled() - Partial failures:**
```typescript
const main = flow<{}, { succeeded: number; failed: number }>(
  { name: "settled" },
  async (ctx) => {
    const p1 = ctx.exec(success, {});
    const p2 = ctx.exec(failure, {});
    const p3 = ctx.exec(success, {});
    const result = await ctx.parallelSettled([p1, p2, p3]);

    return {
      succeeded: result.stats.succeeded,
      failed: result.stats.failed,
    };
  }
);
```

### 6. Error Handling

**Throws FlowError:**
```typescript
const impl = flow<{ shouldFail: boolean }, { success: boolean }>(
  { name: "error-flow" },
  (ctx, input) => {
    if (input.shouldFail) {
      throw new FlowError("Operation failed", "FAILED");
    }
    return { success: true };
  }
);

await expect(flow.execute(impl, { shouldFail: true })).rejects.toThrow(
  FlowError
);
```

### 7. FlowPromise FP Operations

**map - transform success value:**
```typescript
const result = await flow
  .execute(getNumber)
  .map((n) => n * 2)
  .map((n) => n.toString());
```

**switch - chain flows:**
```typescript
const result = await flow
  .execute(firstFlow)
  .switch((num) => flow.execute(secondFlow, num));
```

**mapError - transform error:**
```typescript
try {
  await flow.execute(failingFlow).mapError((err) => {
    return new Error(`Transformed: ${err.message}`);
  });
} catch (error: any) {
  expect(error.message).toBe("Transformed: Original error");
}
```

**switchError - recover from error:**
```typescript
const result = await flow
  .execute(failingFlow)
  .switchError(() => flow.execute(fallbackFlow));
```

**Chaining:**
```typescript
const result = await flow
  .execute(getUser)
  .map((user) => user.name)
  .map((name) => name.toUpperCase())
  .map((name) => `Hello, ${name}!`);
```

## Type System

### Handler Signatures

```typescript
// No dependencies, with input
type Handler1<I, S> = (ctx: Context<I, S>, input: I) => S | Promise<S>;

// With dependencies
type Handler2<D, I, S> = (deps: D, ctx: Context<I, S>, input: I) => S | Promise<S>;

// Void input, no dependencies
type Handler3<S> = (ctx: Context<void, S>) => S | Promise<S>;

// Void input, with dependencies
type Handler4<D, S> = (deps: D, ctx: Context<void, S>) => S | Promise<S>;
```

### Context Type

```typescript
export type Context<I, S> = Accessor.DataStore & {
  readonly pod: Core.Pod;
  input: I;

  run<T>(key: string, fn: () => Promise<T> | T): Promise<T>;

  flow<F extends UFlow>(
    flow: F,
    input: InferInput<F>
  ): Promise<InferOutput<F>>;

  parallel<T extends readonly [UFlow, any][]>(
    flows: [...T]
  ): Promise<ParallelResult<{...}>>;

  parallelSettled<T extends readonly [UFlow, any][]>(
    flows: [...T]
  ): Promise<ParallelSettledResult<{...}>>;

  get(key: unknown): unknown;
  set(key: unknown, value: unknown): unknown | undefined;
};
```

### Flow Definition

```typescript
export type Definition<I, S> = {
  name: string;
  input: StandardSchemaV1<I>;
  success: StandardSchemaV1<S>;
  version?: string;
} & Meta.MetaContainer;
```

### Type Inference

```typescript
export type InferInput<F> = F extends NoDependencyFlow<infer I, any>
  ? I
  : F extends DependentFlow<any, infer I, any>
  ? I
  : never;

export type InferOutput<F> = F extends NoDependencyFlow<any, infer S>
  ? S
  : F extends DependentFlow<any, any, infer S>
  ? S
  : never;
```

### Parallel Results

```typescript
export type ParallelResult<T> = {
  results: T;
  stats: {
    total: number;
    succeeded: number;
    failed: number;
  };
};

export type ParallelSettledResult<T> = {
  results: PromiseSettledResult<T>[];
  stats: {
    total: number;
    succeeded: number;
    failed: number;
  };
};
```

## FlowPromise Class

```typescript
class FlowPromise<T> {
  constructor(pod: Core.Pod, promise: Promise<T>);

  map<U>(fn: (value: T) => U | Promise<U>): FlowPromise<U>;

  switch<U>(fn: (value: T) => FlowPromise<U>): FlowPromise<U>;

  mapError(fn: (error: unknown) => unknown): FlowPromise<T>;

  switchError(fn: (error: unknown) => FlowPromise<T>): FlowPromise<T>;

  then<U>(onfulfilled?, onrejected?): FlowPromise<U>;
  catch<U>(onrejected): FlowPromise<U>;
  finally(onfinally): FlowPromise<T>;

  toPromise(): Promise<T>;
  getPod(): Core.Pod;

  static all<T>(promises: [...T]): FlowPromise<...>;
  static race<T>(promises: [...T]): FlowPromise<...>;
  static allSettled<T>(promises: [...T]): FlowPromise<...>;
}
```

## Error Classes

```typescript
export class FlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly data?: unknown,
    options?: { cause?: unknown }
  );
}

export class FlowValidationError extends FlowError {
  constructor(
    message: string,
    public readonly issues: StandardSchemaV1.Issue[],
    options?: { cause?: unknown }
  );
}
```

## Migration from Old API

### Before (with Result types)
```typescript
const impl = flow<Input, Success, Error>({
  name: "test",
  handler: async (ctx, input) => {
    const data = await ctx.run("op", () => operation());
    return ctx.ok({ data });
  }
});

const result = await flow.execute(impl, input);
if (result.isOk()) {
  console.log(result.data.data);
}
```

### After (Promise-based)
```typescript
const impl = flow<Input, Success>({
  name: "test",
  handler: async (ctx, input) => {
    const data = await ctx.run("op", () => operation());
    return { data };
  }
});

const result = await flow.execute(impl, input);
console.log(result.data);
```

## Key Benefits

1. **Simpler API** - no Result wrapping/unwrapping
2. **Standard patterns** - throw/catch like regular JavaScript
3. **Better type inference** - fewer generic parameters
4. **Less boilerplate** - direct returns
5. **Familiar** - works like Promise naturally
6. **Composable** - FP operations on FlowPromise
