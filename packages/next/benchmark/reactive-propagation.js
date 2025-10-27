import { createScope, provide, derive } from "../dist/index.js";
import { performance } from "perf_hooks";

const iterations = 1000;

const benchmarks = {
  "Reactive chain update propagation (depth 10)": async () => {
    const scope = createScope();
    const counter = provide(() => 0);
    
    // Create a chain of 10 reactive derivations
    let current = counter;
    for (let i = 0; i < 10; i++) {
      const prev = current;
      current = derive(prev.reactive, (val) => val + 1);
    }
    
    // Resolve the entire chain
    await scope.resolve(current);
    
    // Benchmark update propagation
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await scope.update(counter, (val) => val + 1);
    }
    const end = performance.now();
    
    await scope.dispose();
    return end - start;
  },

  "Reactive fan-out (1 source -> 100 dependents)": async () => {
    const scope = createScope();
    const source = provide(() => 0);
    
    // Create 100 reactive dependents
    const dependents = Array.from({ length: 100 }, (_, i) =>
      derive(source.reactive, (val) => val * i)
    );
    
    // Resolve all dependents
    await Promise.all(dependents.map((d) => scope.resolve(d)));
    
    // Benchmark update propagation
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await scope.update(source, (val) => val + 1);
    }
    const end = performance.now();
    
    await scope.dispose();
    return end - start;
  },

  "onUpdate callback invocation": async () => {
    const scope = createScope();
    const counter = provide(() => 0);
    
    let callCount = 0;
    scope.onUpdate(counter, () => { callCount++; });
    
    await scope.resolve(counter);
    
    // Benchmark callback invocation
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await scope.update(counter, (val) => val + 1);
    }
    const end = performance.now();
    
    await scope.dispose();
    return end - start;
  },
};

console.log("Running reactive propagation benchmarks...\n");

for (const [name, benchmark] of Object.entries(benchmarks)) {
  const time = await benchmark();
  const avgTime = time / iterations;
  const opsPerSec = (iterations / time) * 1000;
  
  console.log(`${name}:`);
  console.log(`  Total: ${time.toFixed(2)}ms`);
  console.log(`  Avg: ${avgTime.toFixed(4)}ms/op`);
  console.log(`  Ops/sec: ${opsPerSec.toFixed(0)}`);
  console.log();
}
