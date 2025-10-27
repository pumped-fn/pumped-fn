import { test } from "vitest";
import { provide, preset } from "../src/executor";
import { createScope } from "../src/scope";

test("benchmark immediate value overhead", async () => {
  async function benchmarkWithDelay() {
    const start = performance.now();
    const executor = provide(() => 1);
    
    for (let i = 0; i < 100; i++) {
      const scope = createScope(preset(executor, i));
      await scope.resolve(executor);
      await scope.dispose();
    }
    
    return performance.now() - start;
  }

  async function benchmarkNormal() {
    const start = performance.now();
    const executor = provide(() => 1);
    
    for (let i = 0; i < 100; i++) {
      const scope = createScope();
      await scope.resolve(executor);
      await scope.dispose();
    }
    
    return performance.now() - start;
  }

  // Warmup
  await benchmarkWithDelay();
  await benchmarkNormal();
  
  console.log("\n=== Benchmark: immediate values (with queueMicrotask delay) ===");
  const delayTime = await benchmarkWithDelay();
  console.log(`Time: ${delayTime.toFixed(2)}ms`);
  
  console.log("\n=== Benchmark: normal execution (factory resolution) ===");
  const normalTime = await benchmarkNormal();
  console.log(`Time: ${normalTime.toFixed(2)}ms`);
  
  console.log(`\n=== Overhead per immediate value: ${((delayTime - normalTime) / 100).toFixed(4)}ms ===`);
  console.log(`=== Total overhead for 100 iterations: ${(delayTime - normalTime).toFixed(2)}ms ===\n`);
});
