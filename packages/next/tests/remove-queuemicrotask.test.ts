import { test, expect, vi } from "vitest";
import { provide, preset, derive } from "../src/executor";
import { createScope } from "../src/scope";

test("immediate values work without queueMicrotask delay", async () => {
  const executor = provide(() => 42);
  const scope = createScope(preset(executor, 100));
  
  const result = await scope.resolve(executor);
  
  expect(result).toBe(100);
  await scope.dispose();
});

test("immediate values with dependencies work without delay", async () => {
  const base = provide(() => 10);
  const derived = derive(base, (val) => val * 2);
  
  const scope = createScope(preset(base, 5));
  
  const result = await scope.resolve(derived);
  
  expect(result).toBe(10); // 5 * 2
  await scope.dispose();
});

test("multiple immediate values resolve correctly", async () => {
  const exec1 = provide(() => 1);
  const exec2 = provide(() => 2);
  const exec3 = provide(() => 3);
  
  const scope = createScope(
    preset(exec1, 10),
    preset(exec2, 20),
    preset(exec3, 30)
  );
  
  const [r1, r2, r3] = await Promise.all([
    scope.resolve(exec1),
    scope.resolve(exec2),
    scope.resolve(exec3),
  ]);
  
  expect(r1).toBe(10);
  expect(r2).toBe(20);
  expect(r3).toBe(30);
  
  await scope.dispose();
});

test("test from index.test.ts line 264 - eager load works", async () => {
  const counter = provide(() => 0);
  const fn = vi.fn((count: number) => count + 1);
  const plus = derive(counter, (count) => fn(count));

  const scope = createScope({
    initialValues: [preset(counter, 2)],
  });
  
  // Resolve immediately
  const result = await scope.resolve(plus);
  
  expect(result).toBe(3);
  expect(fn).toHaveBeenCalledWith(2);
  
  await scope.dispose();
});

test("cache is set correctly for immediate values", async () => {
  const executor = provide(() => 42);
  const scope = createScope(preset(executor, 100));
  
  // First resolve
  const result1 = await scope.resolve(executor);
  
  // Second resolve should use cache
  const result2 = await scope.resolve(executor);
  
  expect(result1).toBe(100);
  expect(result2).toBe(100);
  
  await scope.dispose();
});

test("Promised interface works with immediate values", async () => {
  const executor = provide(() => 42);
  const scope = createScope(preset(executor, 100));
  
  const promised = scope.resolve(executor);
  
  // Test then
  const mappedValue = await promised.map(x => x * 2);
  expect(mappedValue).toBe(200);
  
  await scope.dispose();
});
